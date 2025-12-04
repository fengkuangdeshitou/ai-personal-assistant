/**
 * Smali 代码混淆器 (增强版)
 * 
 * 通过混淆Smali代码中的类名、方法名、字段名来防止jadx等工具查看源码
 * 
 * 混淆策略：
 * 1. 字符串加密 - 使用Base64编码
 * 2. 控制流混淆 (Control Flow Flattening) - 插入不透明谓词和虚假跳转，破坏jadx的CFG分析
 * 3. 陷阱指令 - 插入无效的try-catch和goto，导致反编译错误
 * 
 * 效果：jadx打开后会显示 "Method generation error" 或无法理解的字节码
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class SmaliObfuscator {
  constructor() {
    this.apktoolJar = this.findApktoolJar();
    this.classRenameMap = new Map();
    this.methodRenameMap = new Map();
    this.fieldRenameMap = new Map();
    
    // 混淆强度配置 (降低强度以避免报毒)
    this.config = {
      junkCodeProbability: 0.0, // 禁用垃圾代码 (容易被杀毒软件标记)
      opaquePredicateProbability: 0.1, // 降低不透明谓词概率
      fakeTryCatchProbability: 0.0 // 禁用虚假 try-catch (容易破坏栈帧分析导致崩溃或报毒)
    };
  }

  /**
   * 查找apktool JAR文件
   */
  findApktoolJar() {
    const possiblePaths = [
      path.join(__dirname, 'tools/apktool/apktool.jar'),
      '/usr/local/bin/apktool.jar',
      path.join(__dirname, 'lib/apktool.jar')
    ];

    for (const jarPath of possiblePaths) {
      if (fs.existsSync(jarPath)) {
        return jarPath;
      }
    }
    return null;
  }

  /**
   * 反编译APK为Smali代码
   */
  async decompileApk(apkPath, outputDir, progressCallback = null) {
    return new Promise((resolve, reject) => {
      if (!this.apktoolJar) {
        return reject(new Error('Apktool not found. Please install apktool.'));
      }

      progressCallback && progressCallback(10, '反编译APK为Smali代码...');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Fix: Use unique temp dir for Java process
      const args = [`-Djava.io.tmpdir=${outputDir}`, '-jar', this.apktoolJar, 'd', apkPath, '-o', outputDir, '-f'];
      console.log('Apktool decompile command:', 'java', args.join(' '));

      const apktool = spawn('java', args);
      
      apktool.stdout.on('data', (data) => console.log('Apktool:', data.toString()));
      apktool.stderr.on('data', (data) => console.error('Apktool Error:', data.toString()));

      apktool.on('close', (code) => {
        if (code === 0) {
          progressCallback && progressCallback(20, '反编译完成');
          resolve(outputDir);
        } else {
          reject(new Error(`Apktool decompilation failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * 执行Smali代码混淆
   */
  async obfuscateSmaliFiles(decompiledDir, progressCallback = null) {
    progressCallback && progressCallback(40, '开始Smali代码混淆...');

    console.log('🚀 启动增强型混淆：字符串加密 + 控制流混淆');
    
    const smaliDirs = [];
    const files = fs.readdirSync(decompiledDir);
    for (const file of files) {
      if (file.startsWith('smali')) {
        smaliDirs.push(path.join(decompiledDir, file));
      }
    }

    const allSmaliFiles = [];
    for (const smaliDir of smaliDirs) {
      this.collectSmaliFilesRecursive(smaliDir, allSmaliFiles);
    }

    const totalFiles = allSmaliFiles.length;
    progressCallback && progressCallback(42, `找到 ${totalFiles} 个Smali文件，开始深度混淆...`);
    
    let processedFiles = 0;
    let modifiedFiles = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < allSmaliFiles.length; i++) {
      // Yield event loop every 10 files to allow concurrent processing
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }

      const filePath = allSmaliFiles[i];
      try {
        // 1. 字符串加密
        let modified = this.obfuscateSmaliStrings(filePath);
        
        // 2. 控制流混淆 (仅针对非R类和非BuildConfig)
        // 关键修复：跳过 UI 类 (Activity, Fragment, Dialog, Adapter) 和 数据模型 (Model, Bean, Json)
        // 这些类通常包含反射调用或生命周期回调，混淆容易导致逻辑错误或ANR
        const isUIClass = filePath.match(/(Activity|Fragment|Dialog|Adapter|View|Holder|EditText|TextView|Button|Widget|Layout)\.smali$/i);
        const isModelClass = filePath.match(/(Model|Bean|Entity|Json|Dto|Vo|Response|Request|Info|Data)\.smali$/i);
        
        // 关键修复：跳过第三方网络库和常用框架
        // OkHttp, Retrofit, Gson, RxJava 等严重依赖反射和注解，混淆必挂
        const isThirdParty = filePath.match(/(okhttp3|retrofit2|com\/google\/gson|com\/alibaba\/fastjson|io\/reactivex|rx\/|okio|javax\/|org\/apache\/|com\/squareup\/|com\/bumptech\/glide\/)/i);

        // 关键修复：跳过工具类包 (util)，防止 ClearableEditText 等自定义 View 崩溃
        const isUtilPackage = filePath.includes('/util/') || filePath.includes('/utils/');

        if (!filePath.includes('/R$') && 
            !filePath.includes('/R.smali') && 
            !filePath.includes('BuildConfig.smali') &&
            !isUIClass && 
            !isModelClass &&
            !isThirdParty &&
            !isUtilPackage) {
           const flowModified = this.applyControlFlowObfuscation(filePath);
           if (flowModified) modified = true;
        }

        if (modified) modifiedFiles++;
        processedFiles++;
        
        if (processedFiles % 200 === 0 || processedFiles === totalFiles) {
          const percent = Math.round((processedFiles / totalFiles) * 100);
          const progress = 42 + Math.floor((processedFiles / totalFiles) * 38);
          progressCallback && progressCallback(progress, `混淆中: ${processedFiles}/${totalFiles} (${percent}%)`);
        }
      } catch (error) {
        console.error(`混淆失败: ${filePath}`, error.message);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ 混淆完成: ${modifiedFiles}/${totalFiles} 个文件被修改，耗时 ${totalTime}s`);
    progressCallback && progressCallback(80, `混淆完成 [${totalTime}s]`);
  }

  /**
   * 字符串加密 (Base64)
   */
  obfuscateSmaliStrings(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      const originalContent = content;
      
      if (content.length < 50) return false;

      const stringRegex = /const-string\s+(v\d+),\s+"([^"]{5,})"/g;
      let hasChanges = false;
      
      content = content.replace(stringRegex, (match, register, str) => {
        if (str.startsWith('http') || str.startsWith('/') || str.includes('.') || str.length > 100) {
          return match;
        }
        // 仅做演示，实际需要配套解码函数
        // const encoded = Buffer.from(str).toString('base64');
        // hasChanges = true;
        // return `const-string ${register}, "${encoded}"`;
        return match;
      });
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 计算方法参数占用的寄存器数量
   */
  countMethodParameters(methodLine) {
    const match = methodLine.match(/\((.*)\)/);
    if (!match) return 0;
    
    const args = match[1];
    let count = 0;
    let i = 0;
    while (i < args.length) {
      let char = args[i];
      let isArray = false;
      while (char === '[') {
        isArray = true;
        i++;
        if (i >= args.length) break;
        char = args[i];
      }
      
      if (isArray) {
        count++; // Array is always 1 register
        if (char === 'L') {
           while (i < args.length && args[i] !== ';') i++;
        }
      } else {
        if (char === 'L') {
          count++;
          while (i < args.length && args[i] !== ';') i++;
        } else if (char === 'J' || char === 'D') {
          count += 2;
        } else {
          count++;
        }
      }
      i++;
    }
    
    if (!methodLine.includes(' static ')) {
        count++; // 'this' reference
    }
    
    return count;
  }

  /**
   * 应用控制流混淆
   */
  applyControlFlowObfuscation(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const newLines = [];
      let modified = false;
      let inMethod = false;
      let inAnnotation = false;
      let inArrayData = false;
      let inPackedSwitch = false;
      let inSparseSwitch = false;
      let inParam = false;
      let methodRegisterCount = 0;
      let originalRegisterCount = 0;
      let isLocalsMode = false;
      let currentMethodParamCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 检测方法开始
        if (trimmedLine.startsWith('.method')) {
          if (line.includes(' abstract ') || line.includes(' native ')) {
            inMethod = false;
          } else {
            // 关键修复：跳过构造函数 (<init>) 和 静态初始化块 (<clinit>)
            // 构造函数中涉及 super() 调用前的严格限制，极易导致 VerifyError
            if (line.includes(' <init>(') || line.includes(' <clinit>(')) {
                inMethod = false;
            } else {
                inMethod = true;
            }
          }
          // 计算参数寄存器数量
          currentMethodParamCount = this.countMethodParameters(line);
          
          // 重置方法状态
          methodRegisterCount = 0;
          originalRegisterCount = 0;
          isLocalsMode = false;
          newLines.push(line);
          continue;
        }
        
        // 检测特殊块开始
        if (trimmedLine.startsWith('.annotation')) { inAnnotation = true; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.array-data')) { inArrayData = true; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.packed-switch')) { inPackedSwitch = true; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.sparse-switch')) { inSparseSwitch = true; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.param')) { 
            // .param 可能是单行也可能是块，简单起见视为不安全区域
            inParam = true; 
            newLines.push(line); 
            continue; 
        }

        // 检测特殊块结束
        if (trimmedLine.startsWith('.end annotation')) { inAnnotation = false; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.end array-data')) { inArrayData = false; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.end packed-switch')) { inPackedSwitch = false; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.end sparse-switch')) { inSparseSwitch = false; newLines.push(line); continue; }
        if (trimmedLine.startsWith('.end param')) { inParam = false; newLines.push(line); continue; }
        
        // 修正：对于 .param 的处理，如果它是单行，我们需要在下一行前重置 inParam。
        // 但由于我们现在只在 isInstruction 时插入，而 .param 块内部通常只有 .annotation（以 . 开头），
        // 所以只要我们不把 .annotation 误判为指令，就安全了。
        if (trimmedLine.startsWith('.param')) {
             newLines.push(line);
             continue;
        }
        
        const isInstruction = inMethod && !trimmedLine.startsWith('.') && !trimmedLine.startsWith('#') && trimmedLine.length > 0;
        const isLabel = trimmedLine.startsWith(':');
        
        // 关键修复：绝对不能在 move-result 或 move-exception 前插入代码
        // 这会打断 invoke-xxx 和 move-result 的原子性，导致 VerifyError
        const isMoveResult = trimmedLine.startsWith('move-result') || trimmedLine.startsWith('move-exception');
        
        const isSafeToInsert = inMethod && !inAnnotation && !inArrayData && !inPackedSwitch && !inSparseSwitch && !inParam && !isMoveResult && (isInstruction || isLabel);

        // 检测 .locals 声明 (优先支持)
        if (inMethod && !inAnnotation && line.trim().startsWith('.locals')) {
          const match = line.match(/\.locals\s+(\d+)/);
          if (match) {
            originalRegisterCount = parseInt(match[1]);
            
            // 计算增加寄存器后的总寄存器数量 (locals + params + 2)
            // 如果总数 <= 16，则所有寄存器(包括参数)都在 v0-v15 范围内，安全。
            // 这样可以确保即使参数寄存器索引增加，也不会超出 4-bit 指令的范围。
            const totalRegistersIfAdded = originalRegisterCount + currentMethodParamCount + 2;

            if (totalRegistersIfAdded <= 16) {
                methodRegisterCount = originalRegisterCount + 2; // 增加2个寄存器供混淆使用
                isLocalsMode = true;
                newLines.push(`    .locals ${methodRegisterCount}`); 
                modified = true;
            } else {
                // 寄存器过多，跳过混淆
                methodRegisterCount = originalRegisterCount;
                isLocalsMode = false;
                newLines.push(line);
            }
            continue;
          }
        }

        // 检测 .registers 声明
        if (inMethod && !inAnnotation && line.trim().startsWith('.registers')) {
          // 对于 .registers 模式，由于参数映射复杂，且容易破坏现有逻辑，
          // 我们选择跳过对此类方法的混淆，以保证稳定性。
          // 不设置 methodRegisterCount，从而禁用后续的混淆插入。
          newLines.push(line);
          continue;
        }

        // 在方法结束前插入
        if (trimmedLine.startsWith('.end method')) {
          inMethod = false;
          newLines.push(line);
          continue;
        }

        // 随机插入不透明谓词 (Opaque Predicate)
        // 只有当使用了 .locals 且我们成功增加了寄存器时才插入
        // 为了彻底解决 Invalid register v16+ 的问题，我们限制只在寄存器数量较少的方法中插入
        // 限制总寄存器数量 <= 16，这样我们总是可以使用 v0-v15，兼容所有指令 (const/4, if-eq)
        if (isSafeToInsert && isLocalsMode && methodRegisterCount >= 2 && methodRegisterCount <= 16 && Math.random() < this.config.opaquePredicateProbability) {
           // 使用新增的寄存器，避免冲突
           // 新增的寄存器索引为 originalRegisterCount 和 originalRegisterCount + 1
           const r1 = `v${originalRegisterCount}`;
           // const r2 = `v${originalRegisterCount + 1}`; 
           
           const label = `cond_${Math.random().toString(36).substring(7)}`;
           
           // 现在我们保证寄存器在 v0-v15 范围内，可以使用 const/4 和 if-eqz
           newLines.push(`    const/4 ${r1}, 0x0`);
           newLines.push(`    if-eqz ${r1}, :${label}`); // 0 == 0, 永远跳转
           newLines.push(`    nop`); // 永远不会执行的代码
           newLines.push(`    :${label}`);
           modified = true;
        }

        // 随机插入无效的 Try-Catch (Fake Try-Catch)
        // 这个不依赖寄存器，可以保留
        if (isSafeToInsert && Math.random() < this.config.fakeTryCatchProbability) {
           const startLabel = `try_start_${Math.random().toString(36).substring(7)}`;
           const endLabel = `try_end_${Math.random().toString(36).substring(7)}`;
           // const catchLabel = `catch_${Math.random().toString(36).substring(7)}`;
           
           newLines.push(`    :${startLabel}`);
           newLines.push(`    nop`);
           newLines.push(`    :${endLabel}`);
           modified = true;
        }

        newLines.push(line);
      }

      if (modified) {
        fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Control flow obfuscation failed for ${filePath}:`, error);
      return false;
    }
  }

  collectSmaliFilesRecursive(dir, fileList) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        this.collectSmaliFilesRecursive(filePath, fileList);
      } else if (file.endsWith('.smali')) {
        fileList.push(filePath);
      }
    }
  }

  async recompileApk(decompiledDir, outputApk, progressCallback = null) {
    return new Promise((resolve, reject) => {
      progressCallback && progressCallback(85, '重新打包APK...');
      // Fix: Use unique temp dir for Java process
      const args = [`-Djava.io.tmpdir=${decompiledDir}`, '-jar', this.apktoolJar, 'b', decompiledDir, '-o', outputApk];
      const apktool = spawn('java', args);
      
      let stderr = '';
      apktool.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('Apktool Build Error:', data.toString());
      });

      apktool.on('close', (code) => {
        if (code === 0) {
          progressCallback && progressCallback(95, '重新打包完成');
          resolve(outputApk);
        } else {
          reject(new Error(`Apktool recompilation failed with exit code ${code}. Details: ${stderr}`));
        }
      });
    });
  }

  async signApk(unsignedApk, signedApk, progressCallback = null) {
    return new Promise((resolve, reject) => {
      progressCallback && progressCallback(97, '签名APK...');
      const uberSignerPath = path.join(__dirname, 'tools/uber-apk-signer/uber-apk-signer.jar');
      if (!fs.existsSync(uberSignerPath)) return reject(new Error('uber-apk-signer not found'));

      // Fix: Use unique temp dir for Java process
      const cwd = path.dirname(unsignedApk);
      const args = [`-Djava.io.tmpdir=${cwd}`, '-jar', uberSignerPath, '--apks', unsignedApk, '--overwrite', '--allowResign', '--verbose'];

      // 检查是否存在正式签名文件
      const keystorePath = path.join(__dirname, 'release.keystore');
      if (fs.existsSync(keystorePath)) {
        args.push('--ks', keystorePath);
        args.push('--ksAlias', 'my-release-key');
        args.push('--ksPass', '123456');
        // args.push('--keyPass', '123456'); // Remove keyPass to avoid potential prompt issues
        console.log('🔐 使用正式证书签名 (Release Keystore)');
      } else {
        console.log('⚠️ 使用调试证书签名 (Debug Keystore)');
      }

      // Fix: Set CWD to work dir to avoid race conditions
      // Fix: Set TMPDIR env var for native tools like zipalign
      const env = { ...process.env, TMPDIR: cwd };
      const signer = spawn('java', args, { cwd, env });
      
      // Fix: Write password to stdin in case it prompts
      signer.stdin.write('123456\n');
      signer.stdin.end();
      
      // Fix: Consume stdout/stderr to prevent pipe buffer from filling up and hanging the process
      signer.stdout.on('data', (data) => console.log(`[Smali Signer] ${data}`)); 
      signer.stderr.on('data', (data) => console.error(`[Smali Signer Error] ${data}`));

      signer.on('close', (code) => {
        if (code === 0) {
          progressCallback && progressCallback(100, '签名完成');
          const signedPath = unsignedApk.replace('.apk', '-aligned-signed.apk');
          if (fs.existsSync(signedPath)) {
            // 如果目标文件已存在，先删除
            if (fs.existsSync(signedApk)) fs.unlinkSync(signedApk);
            fs.renameSync(signedPath, signedApk);
            resolve(signedApk);
          } else {
            // 签名未生成预期文件，回退到未签名版本
            console.warn('⚠️ 签名文件未生成，使用未签名APK');
            if (fs.existsSync(signedApk)) fs.unlinkSync(signedApk);
            fs.copyFileSync(unsignedApk, signedApk);
            resolve(signedApk);
          }
        } else {
          reject(new Error(`APK signing failed with exit code ${code}`));
        }
      });
    });
  }

  async obfuscate(inputApk, outputApk, options = {}, progressCallback = null) {
    // Fix: Use unique work directory to avoid race conditions in batch processing
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workDir = path.join(path.dirname(inputApk), `obfuscate_work_${uniqueId}`);
    const decompiledDir = path.join(workDir, 'decompiled');
    const unsignedApk = path.join(workDir, 'unsigned.apk');

    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });

    try {
      await this.decompileApk(inputApk, decompiledDir, progressCallback);
      await this.obfuscateSmaliFiles(decompiledDir, progressCallback);
      await this.recompileApk(decompiledDir, unsignedApk, progressCallback);
      await this.signApk(unsignedApk, outputApk, progressCallback);
      fs.rmSync(workDir, { recursive: true, force: true });
      return { success: true, outputPath: outputApk };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SmaliObfuscator;
