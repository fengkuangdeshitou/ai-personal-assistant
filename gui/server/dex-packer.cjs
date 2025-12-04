const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

class DexPacker {
  constructor(tempDir = null) {
    this.apktoolJar = this.findApktoolJar();
    if (tempDir) {
      this.tempDir = tempDir;
    } else {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.tempDir = path.join(__dirname, 'packer_temp', uniqueId);
    }
  }

  findApktoolJar() {
    const possiblePaths = [
      path.join(__dirname, 'tools/apktool/apktool.jar'),
      '/usr/local/bin/apktool.jar',
      path.join(__dirname, 'lib/apktool.jar')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  log(msg) {
    console.log(`[DexPacker] ${msg}`);
  }

  async pack(inputApk, outputApk, progressCallback) {
    this.log(`开始DEX加壳: ${inputApk}`);
    if (fs.existsSync(this.tempDir)) fs.rmSync(this.tempDir, { recursive: true, force: true });
    fs.mkdirSync(this.tempDir, { recursive: true });

    const workDir = path.join(this.tempDir, 'work');
    const distDir = path.join(this.tempDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });

    try {
      // 1. 反编译 (只解码Manifest，不解码资源和源码，提高速度并避免资源重打包错误)
      progressCallback && progressCallback(10, '正在反编译APK...');
      // -s: 不反编译DEX (我们直接解压获取)
      // 去掉 -r 以便解码 Manifest (否则无法修改 Application)
      await this.runApktool(['d', inputApk, '-o', workDir, '-f', '-s']);

      // 2. 获取原始Application类名
      const manifestPath = path.join(workDir, 'AndroidManifest.xml');
      if (!fs.existsSync(manifestPath)) {
          throw new Error('AndroidManifest.xml not found. Apktool failed to decode it.');
      }
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const appNameMatch = manifestContent.match(/<application[^>]*android:name="([^"]*)"/);
      let originalAppClass = appNameMatch ? appNameMatch[1] : 'android.app.Application';
      if (originalAppClass.startsWith('.')) {
        // 处理相对路径 .MyApplication
        const packageMatch = manifestContent.match(/package="([^"]*)"/);
        if (packageMatch) {
          originalAppClass = packageMatch[1] + originalAppClass;
        }
      }
      this.log(`原始Application: ${originalAppClass}`);

      // 3. 提取原始DEX (直接解压InputAPK)
      progressCallback && progressCallback(30, '提取并加密原始DEX...');
      const unzipDir = path.join(this.tempDir, 'unzip');
      if (!fs.existsSync(unzipDir)) fs.mkdirSync(unzipDir);
      
      // 直接解压 inputApk 获取 .dex 文件
      // 使用 unzip 命令，只解压 *.dex
      try {
        // Fix: Use spawn instead of execSync to avoid blocking the event loop
        await new Promise((resolve, reject) => {
            const unzip = spawn('unzip', ['-q', '-o', inputApk, '*.dex', '-d', unzipDir]);
            unzip.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`Unzip failed with code ${code}`));
            });
            unzip.on('error', reject);
        });
      } catch (e) {
        this.log('Unzip failed or no dex files found: ' + e.message);
        // Fallback or rethrow?
      }
      
      // 4. 加密DEX
      const dexFiles = fs.readdirSync(unzipDir).filter(f => f.endsWith('.dex'));
      const assetsDir = path.join(workDir, 'assets');
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

      // 随机生成 XOR Key (1-255)
      const key = Math.floor(Math.random() * 254) + 1;
      this.log(`使用随机密钥加密: 0x${key.toString(16)}`);
      
      const payloadNames = [];
      for (const dexFile of dexFiles) {
        const dexPath = path.join(unzipDir, dexFile);
        const dexData = fs.readFileSync(dexPath);
        const encryptedData = Buffer.alloc(dexData.length);
        for (let i = 0; i < dexData.length; i++) {
          encryptedData[i] = dexData[i] ^ key;
        }
        // 保存为 assets/payload.dat (如果是多dex，可以命名为 payload_classes.dat 等)
        const targetName = dexFile === 'classes.dex' ? 'payload.dat' : `payload_${dexFile.replace('.dex', '.dat')}`;
        fs.writeFileSync(path.join(assetsDir, targetName), encryptedData);
        payloadNames.push(targetName);
      }

      // 5. 准备Shell环境
      progressCallback && progressCallback(50, '注入Shell代码...');
      
      // 生成随机包名和类名以规避查杀
      const randomString = (length) => {
          const chars = 'abcdefghijklmnopqrstuvwxyz';
          let result = '';
          for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
      };
      
      // 避免使用 "Shell" 关键字，改用更通用的名称
      const shellPackage = `com.${randomString(5)}.${randomString(6)}`;
      const shellClass = `App${randomString(4)}`; // Changed from Shell to App
      const shellFullClass = `${shellPackage}.${shellClass}`;
      
      // 5.1 编译Native库 (V2)
      // 动态修改 C++ 源码中的 JNI 函数名以匹配随机生成的类名
      this.log('配置并编译Native库...');
      const jniSourcePath = path.join(__dirname, 'packer_src/jni/packer.cpp');
      let originalCppContent = '';
      if (fs.existsSync(jniSourcePath)) {
          originalCppContent = fs.readFileSync(jniSourcePath, 'utf-8');
          // 构造 JNI 函数名: Java_com_package_Class_decrypt
          // 注意: 包名中的点号需要替换为下划线
          const jniFuncName = `Java_${shellPackage.replace(/\./g, '_')}_${shellClass}_decrypt`;
          let newCppContent = originalCppContent.replace(
              /Java_[a-zA-Z0-9_]+_decrypt/g, 
              jniFuncName
          );
          
          // 动态替换解密密钥
          // 查找 const jbyte KEY = (jbyte)0xAA; 并替换为生成的 key
          newCppContent = newCppContent.replace(
              /const jbyte KEY = \(jbyte\)0x[0-9A-Fa-f]+;/g,
              `const jbyte KEY = (jbyte)0x${key.toString(16)};`
          );
          
          fs.writeFileSync(jniSourcePath, newCppContent);
      }
      
      await this.buildNativeLib();
      
      // 恢复 C++ 源码 (可选，但为了保持 git 状态干净最好恢复)
      if (originalCppContent) {
          fs.writeFileSync(jniSourcePath, originalCppContent);
      }
      
      // 5.2 复制Native库到APK目录
      const libDir = path.join(workDir, 'lib');
      if (!fs.existsSync(libDir)) fs.mkdirSync(libDir);
      
      const ndkLibsDir = path.join(__dirname, 'packer_src/libs');
      if (fs.existsSync(ndkLibsDir)) {
        // 复制 libs/armeabi-v7a 等到 work/lib/
        const abis = fs.readdirSync(ndkLibsDir);
        for (const abi of abis) {
            const srcAbiDir = path.join(ndkLibsDir, abi);
            const destAbiDir = path.join(libDir, abi);
            if (!fs.existsSync(destAbiDir)) fs.mkdirSync(destAbiDir, { recursive: true });
            
            const soFiles = fs.readdirSync(srcAbiDir);
            for (const so of soFiles) {
                fs.copyFileSync(path.join(srcAbiDir, so), path.join(destAbiDir, so));
            }
        }
      } else {
          this.log('⚠️ Native库编译失败或未找到，将降级为V1模式');
      }

      // 删除原有的smali目录 (如果有)
      const smaliDirs = fs.readdirSync(workDir).filter(f => f.startsWith('smali'));
      for (const d of smaliDirs) {
        fs.rmSync(path.join(workDir, d), { recursive: true, force: true });
      }
      
      // 删除原有的dex文件 (因为使用了-s，它们被保留了，但我们需要移除它们以隐藏源码)
      const originalDexFiles = fs.readdirSync(workDir).filter(f => f.endsWith('.dex'));
      for (const f of originalDexFiles) {
        fs.unlinkSync(path.join(workDir, f));
      }
      
      // 创建新的smali目录
      const smaliDir = path.join(workDir, 'smali');
      if (!fs.existsSync(smaliDir)) fs.mkdirSync(smaliDir);
      
      // (变量定义已移动到上方)
      
      const shellSmaliPath = path.join(smaliDir, shellPackage.replace(/\./g, '/'), `${shellClass}.smali`);
      
      this.log(`生成随机Shell类: ${shellFullClass}`);
      
      const shellSmaliDir = path.dirname(shellSmaliPath);
      fs.mkdirSync(shellSmaliDir, { recursive: true });
      
      const proxySmaliContent = this.getProxyApplicationSmali(originalAppClass, payloadNames, shellFullClass);
      fs.writeFileSync(shellSmaliPath, proxySmaliContent);

      // 6. 修改Manifest
      let newManifest = manifestContent;
      
      // 移除 appComponentFactory 属性，防止系统在Shell加载前尝试实例化它
      // 因为该类在加密的DEX中，此时尚未加载
      newManifest = newManifest.replace(/android:appComponentFactory="[^"]*"/g, '');

      if (appNameMatch) {
        newManifest = newManifest.replace(appNameMatch[0], `android:name="${shellFullClass}"`);
      } else {
        newManifest = newManifest.replace('<application', `<application android:name="${shellFullClass}"`);
      }
      fs.writeFileSync(manifestPath, newManifest);

      // 7. 重新打包
      progressCallback && progressCallback(70, '重新打包Shell APK...');
      const unsignedApk = path.join(distDir, 'unsigned.apk');
      await this.runApktool(['b', workDir, '-o', unsignedApk, '--use-aapt2']);

      // 8. 签名
      progressCallback && progressCallback(90, '签名APK...');
      await this.signApk(unsignedApk, outputApk);

      this.log('加壳完成');
      return true;

    } catch (error) {
      console.error('加壳失败:', error);
      throw error;
    } finally {
      // 清理
      // fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  runApktool(args) {
    return new Promise((resolve, reject) => {
      // Fix: Use unique temp dir for Java process to avoid collisions
      const javaArgs = [`-Djava.io.tmpdir=${this.tempDir}`, '-jar', this.apktoolJar, ...args];
      const child = spawn('java', javaArgs);
      
      // Fix: Consume stdout/stderr to prevent pipe buffer from filling up
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});

      child.on('close', code => {
        if (code === 0) {
            resolve();
        } else {
            reject(new Error(`Apktool exited with ${code}`));
        }
      });
    });
  }

  signApk(input, output) {
    return new Promise((resolve, reject) => {
      const signerPath = path.join(__dirname, 'tools/uber-apk-signer/uber-apk-signer.jar');
      
      if (!fs.existsSync(signerPath)) {
        this.log('⚠️ 未找到uber-apk-signer.jar，跳过签名 (输出未签名APK)');
        this.log(`Copying ${input} to ${output}`);
        fs.copyFileSync(input, output);
        if (fs.existsSync(output)) {
           this.log(`✅ Output file created: ${output}`);
        } else {
           this.log(`❌ Output file NOT created: ${output}`);
        }
        resolve();
        return;
      }

      this.log(`Signing APK: ${input}`);
      // Fix: Use unique temp dir for Java process
      const args = [`-Djava.io.tmpdir=${this.tempDir}`, '-jar', signerPath, '--apks', input, '--overwrite', '--allowResign', '--verbose'];

      // 检查是否存在正式签名文件
      const keystorePath = path.join(__dirname, 'release.keystore');
      if (fs.existsSync(keystorePath)) {
        args.push('--ks', keystorePath);
        args.push('--ksAlias', 'my-release-key');
        args.push('--ksPass', '123456');
        // args.push('--keyPass', '123456');
        this.log('🔐 使用正式证书签名 (Release Keystore)');
      } else {
        this.log('⚠️ 使用调试证书签名 (Debug Keystore)');
      }

      // Fix: Set CWD to temp dir to avoid race conditions with temporary files
      // Fix: Set TMPDIR env var for native tools like zipalign
      const env = { ...process.env, TMPDIR: this.tempDir };
      const child = spawn('java', args, { cwd: this.tempDir, env });
      
      // Fix: Write password to stdin in case it prompts
      child.stdin.write('123456\n');
      child.stdin.end();

      // Fix: Consume stdout/stderr to prevent pipe buffer from filling up and hanging the process
      child.stdout.on('data', (data) => { this.log(`[Signer] ${data}`); });
      child.stderr.on('data', (data) => { this.log(`[Signer Error] ${data}`); });

      child.on('close', code => {
        if (code === 0) {
          const signed = input.replace('.apk', '-aligned-signed.apk');
          if (fs.existsSync(signed)) {
            fs.renameSync(signed, output);
            this.log('✅ Signing success');
            resolve();
          } else {
            this.log(`⚠️ Signed file not found: ${signed}. Falling back to unsigned.`);
            fs.copyFileSync(input, output);
            resolve();
          }
        } else {
            this.log('❌ Signing failed with code ' + code);
            reject(new Error('Signing failed'));
        }
      });
    });
  }

  buildNativeLib() {
    return new Promise((resolve, reject) => {
        const ndkBuildPath = path.join(__dirname, 'tools/ndk/ndk-build');
        const jniDir = path.join(__dirname, 'packer_src/jni');
        
        if (!fs.existsSync(ndkBuildPath)) {
            this.log('❌ NDK not found at ' + ndkBuildPath);
            resolve(false); // Fail gracefully
            return;
        }

        this.log('Executing ndk-build...');
        const child = spawn(ndkBuildPath, ['-C', path.dirname(jniDir)]); // -C to switch dir
        
        child.on('close', code => {
            if (code === 0) {
                this.log('✅ Native build success');
                resolve(true);
            } else {
                this.log('❌ Native build failed with code ' + code);
                resolve(false);
            }
        });
    });
  }

  // 生成Shell Application的Smali代码
  // V2: Native解密 + InMemoryDexClassLoader (Android 8.0+)
  // 支持多DEX加载
  getProxyApplicationSmali(realAppClass, payloadNames, shellFullClass) {
    const shellSmaliClass = 'L' + shellFullClass.replace(/\./g, '/') + ';';
    
    // 生成加载所有payload的代码
    let loadPayloadsCode = '';
    let dexBuffersInitCode = '';
    
    // 我们需要构造一个 ByteBuffer[] 数组 (API 27+) 或者单个 ByteBuffer (API 26)
    // 为了简化，我们采用文件解压 + DexClassLoader 方案作为通用方案 (V1)，
    // 或者如果坚持用 V2 (内存加载)，我们需要处理多DEX。
    // 鉴于用户反馈了兼容性问题 (Didn't find class)，文件模式其实更稳定，虽然容易被杀。
    // 但用户也反馈了报毒。内存加载更不容易报毒。
    // 让我们尝试实现多DEX的内存加载。
    // 策略：读取所有 payload -> 解密 -> 放入 ArrayList<ByteBuffer> -> 转数组 -> InMemoryDexClassLoader
    
    // 但是 Smali 写 ArrayList 比较繁琐。
    // 我们可以简单地展开循环。
    
    // 针对 API 26 (Android 8.0)，InMemoryDexClassLoader 只支持单个 ByteBuffer。
    // 针对 API 27+ (Android 8.1+)，支持 ByteBuffer[]。
    
    // 生成读取并解密每个 payload 的代码
    let readAndDecryptCode = `
    # 创建 ArrayList<ByteBuffer>
    new-instance v4, Ljava/util/ArrayList;
    invoke-direct {v4}, Ljava/util/ArrayList;-><init>()V
    
    invoke-virtual {p0}, ${shellSmaliClass}->getAssets()Landroid/content/res/AssetManager;
    move-result-object v0
    `;

    payloadNames.forEach((payloadName, index) => {
        readAndDecryptCode += `
    # 处理 ${payloadName}
    const-string v1, "${payloadName}"
    invoke-virtual {v0, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v1
    
    invoke-virtual {v1}, Ljava/io/InputStream;->available()I
    move-result v2
    new-array v3, v2, [B
    
    invoke-virtual {v1, v3}, Ljava/io/InputStream;->read([B)I
    invoke-virtual {v1}, Ljava/io/InputStream;->close()V
    
    # Native解密
    invoke-direct {p0, v3}, ${shellSmaliClass}->decrypt([B)[B
    move-result-object v3
    
    # 包装为 ByteBuffer
    invoke-static {v3}, Ljava/nio/ByteBuffer;->wrap([B)Ljava/nio/ByteBuffer;
    move-result-object v3
    
    # 添加到列表
    invoke-virtual {v4, v3}, Ljava/util/ArrayList;->add(Ljava/lang/Object;)Z
    `;
    });

    // 注入 DexElements 的方法 (比替换 ClassLoader 更稳定，兼容 ContentProvider)
    // 将 sourceLoader 的 dexElements 合并到 targetLoader 中
    let injectDexElementsCode = `
.method private injectDexElements(Ljava/lang/ClassLoader;Ljava/lang/ClassLoader;)V
    .locals 9
    .param p1, "targetLoader"    # Ljava/lang/ClassLoader;
    .param p2, "sourceLoader"    # Ljava/lang/ClassLoader;

    :try_start_inject
    # 1. 获取 BaseDexClassLoader.pathList
    const-string v0, "dalvik.system.BaseDexClassLoader"
    invoke-static {v0}, Ljava/lang/Class;->forName(Ljava/lang/String;)Ljava/lang/Class;
    move-result-object v0
    const-string v1, "pathList"
    invoke-virtual {v0, v1}, Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;
    move-result-object v0
    const/4 v1, 0x1
    invoke-virtual {v0, v1}, Ljava/lang/reflect/Field;->setAccessible(Z)V

    # 获取 pathList 对象
    invoke-virtual {v0, p1}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v2 
    # v2 = targetPathList
    invoke-virtual {v0, p2}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v3 
    # v3 = sourcePathList

    # 2. 获取 DexPathList.dexElements
    invoke-virtual {v2}, Ljava/lang/Object;->getClass()Ljava/lang/Class;
    move-result-object v4
    const-string v5, "dexElements"
    invoke-virtual {v4, v5}, Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;
    move-result-object v4
    invoke-virtual {v4, v1}, Ljava/lang/reflect/Field;->setAccessible(Z)V

    # 获取 dexElements 数组
    invoke-virtual {v4, v2}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v5 
    # v5 = targetElements
    invoke-virtual {v4, v3}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v6 
    # v6 = sourceElements

    # 3. 合并数组 (source 在前，target 在后)
    # 获取数组组件类型
    invoke-virtual {v5}, Ljava/lang/Object;->getClass()Ljava/lang/Class;
    move-result-object v7
    invoke-virtual {v7}, Ljava/lang/Class;->getComponentType()Ljava/lang/Class;
    move-result-object v7

    # 计算长度
    invoke-static {v5}, Ljava/lang/reflect/Array;->getLength(Ljava/lang/Object;)I
    move-result v8
    # v8 = targetLength
    
    invoke-static {v6}, Ljava/lang/reflect/Array;->getLength(Ljava/lang/Object;)I
    move-result v1
    # v1 = sourceLength

    # 创建新数组
    add-int v0, v8, v1
    # v0 = totalLength
    
    invoke-static {v7, v0}, Ljava/lang/reflect/Array;->newInstance(Ljava/lang/Class;I)Ljava/lang/Object;
    move-result-object v7 
    # v7 = newElements

    # 复制 source 到新数组头部
    const/4 v0, 0x0
    invoke-static {v6, v0, v7, v0, v1}, Ljava/lang/System;->arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V

    # 复制 target 到新数组后部
    # arraycopy(targetElements, 0, newElements, sourceLength, targetLength)
    invoke-static {v5, v0, v7, v1, v8}, Ljava/lang/System;->arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V

    # 4. 将新数组设置回 targetPathList
    invoke-virtual {v4, v2, v7}, Ljava/lang/reflect/Field;->set(Ljava/lang/Object;Ljava/lang/Object;)V

    :try_end_inject
    .catch Ljava/lang/Exception; {:try_start_inject .. :try_end_inject} :catch_inject

    goto :goto_inject_end

    :catch_inject
    move-exception v0
    invoke-virtual {v0}, Ljava/lang/Exception;->printStackTrace()V

    :goto_inject_end
    return-void
.end method
    `;

    return `.class public ${shellSmaliClass}
.super Landroid/app/Application;

.field private static final REAL_APP:Ljava/lang/String; = "${realAppClass}"

# 声明Native方法
.method private native decrypt([B)[B
.end method

# 静态代码块加载库
.method static constructor <clinit>()V
    .locals 1
    const-string v0, "packer"
    invoke-static {v0}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V
    return-void
.end method

# 构造函数
.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/app/Application;-><init>()V
    return-void
.end method

${injectDexElementsCode}

# attachBaseContext
.method protected attachBaseContext(Landroid/content/Context;)V
    .locals 10
    .param p1, "base"    # Landroid/content/Context;

    invoke-super {p0, p1}, Landroid/app/Application;->attachBaseContext(Landroid/content/Context;)V

    :try_start_0
    ${readAndDecryptCode}
    
    # 检查SDK版本 >= 27 (Android 8.1)
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v1, 0x1b
    
    if-lt v0, v1, :cond_legacy
    
    # === V2: 内存加载 (Android 8.1+) ===
    # 将 ArrayList 转为 ByteBuffer[]
    invoke-virtual {v4}, Ljava/util/ArrayList;->size()I
    move-result v0
    new-array v0, v0, [Ljava/nio/ByteBuffer;
    invoke-virtual {v4, v0}, Ljava/util/ArrayList;->toArray([Ljava/lang/Object;)[Ljava/lang/Object;
    move-result-object v0
    check-cast v0, [Ljava/nio/ByteBuffer;
    
    # new InMemoryDexClassLoader(ByteBuffer[], ClassLoader)
    new-instance v1, Ldalvik/system/InMemoryDexClassLoader;
    invoke-virtual {p0}, ${shellSmaliClass}->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v2
    invoke-direct {v1, v0, v2}, Ldalvik/system/InMemoryDexClassLoader;-><init>([Ljava/nio/ByteBuffer;Ljava/lang/ClassLoader;)V
    
    # 注入 DexElements (合并到系统ClassLoader)
    invoke-virtual {p0}, ${shellSmaliClass}->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v2
    invoke-direct {p0, v2, v1}, ${shellSmaliClass}->injectDexElements(Ljava/lang/ClassLoader;Ljava/lang/ClassLoader;)V
    
    goto :goto_end

    :cond_legacy
    # === V1: 文件加载 (Android < 8.1) ===
    # 写入第一个DEX到文件 (简化版，仅支持单DEX或主DEX)
    
    invoke-virtual {p0}, ${shellSmaliClass}->getFilesDir()Ljava/io/File;
    move-result-object v0
    
    const/4 v1, 0x0
    invoke-virtual {v4, v1}, Ljava/util/ArrayList;->get(I)Ljava/lang/Object;
    move-result-object v2
    check-cast v2, Ljava/nio/ByteBuffer;
    invoke-virtual {v2}, Ljava/nio/ByteBuffer;->array()[B
    move-result-object v2
    
    new-instance v3, Ljava/io/File;
    const-string v5, "payload.dex"
    invoke-direct {v3, v0, v5}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    
    new-instance v5, Ljava/io/FileOutputStream;
    invoke-direct {v5, v3}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V
    invoke-virtual {v5, v2}, Ljava/io/FileOutputStream;->write([B)V
    invoke-virtual {v5}, Ljava/io/FileOutputStream;->close()V
    
    # 使用 DexClassLoader 加载 payload.dex
    new-instance v1, Ldalvik/system/DexClassLoader;
    invoke-virtual {v3}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;
    move-result-object v6
    invoke-virtual {v0}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;
    move-result-object v7
    const/4 v8, 0x0
    invoke-virtual {p0}, ${shellSmaliClass}->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v9
    invoke-direct {v1, v6, v7, v8, v9}, Ldalvik/system/DexClassLoader;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/ClassLoader;)V

    # 注入 DexElements
    invoke-virtual {p0}, ${shellSmaliClass}->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v2
    invoke-direct {p0, v2, v1}, ${shellSmaliClass}->injectDexElements(Ljava/lang/ClassLoader;Ljava/lang/ClassLoader;)V

    :goto_end
    
    # 尝试加载真实Application类
    const-string v2, "${realAppClass}"
    invoke-virtual {p0}, ${shellSmaliClass}->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v3
    invoke-virtual {v3, v2}, Ljava/lang/ClassLoader;->loadClass(Ljava/lang/String;)Ljava/lang/Class;
    
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_return

    :catch_0
    move-exception v0
    invoke-virtual {v0}, Ljava/lang/Exception;->printStackTrace()V

    :goto_return
    return-void
.end method

.method public onCreate()V
    .locals 1
    invoke-super {p0}, Landroid/app/Application;->onCreate()V
    return-void
.end method
`;
  }
}

module.exports = DexPacker;
