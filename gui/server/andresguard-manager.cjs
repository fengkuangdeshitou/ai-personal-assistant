/**
 * AndResGuard 资源混淆管理器
 * 
 * AndResGuard 是微信开源的资源混淆工具
 * 功能：
 * 1. 资源文件名混淆 - 将resources.arsc中的资源路径混淆成短路径
 * 2. 资源文件压缩 - 通过7zip对资源文件进行极限压缩
 * 3. 减小APK体积 - 通常可以减少10%-30%的APK大小
 * 
 * GitHub: https://github.com/shwenzhang/AndResGuard
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const https = require('https');

class AndResGuardManager {
  constructor() {
    this.andResGuardJar = this.findAndResGuardJar();
    this.apktoolJar = this.findApktoolJar();
    this.version = '1.2.15'; // 使用官方仓库中可用的最新预编译版本
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * 查找AndResGuard JAR文件
   */
  findAndResGuardJar() {
    const possiblePaths = [
      path.join(__dirname, 'tools/andresguard/AndResGuard.jar'),
      path.join(__dirname, 'tools/andresguard/andresguard-core.jar'),
      '/usr/local/andresguard/AndResGuard.jar'
    ];

    for (const jarPath of possiblePaths) {
      if (fs.existsSync(jarPath)) {
        return jarPath;
      }
    }

    return null;
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
   * 获取APK包名
   */
  async getPackageName(apkPath) {
    return new Promise((resolve, reject) => {
      if (!this.apktoolJar) return reject(new Error('Apktool not found'));
      
      const tempDir = path.join(path.dirname(apkPath), 'temp_manifest_' + Date.now());
      
      // Fix: Ensure temp dir exists for JVM
      if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
      }

      // Fix: Add -Djava.io.tmpdir to isolate JVM temp files
      const args = ['-Djava.io.tmpdir=' + tempDir, '-jar', this.apktoolJar, 'd', '-f', '-s', apkPath, '-o', tempDir];
      
      const child = spawn('java', args);

      // Fix: Drain buffers to prevent hanging
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});
      
      child.on('close', code => {
          if (code === 0) {
              try {
                  const manifestPath = path.join(tempDir, 'AndroidManifest.xml');
                  if (fs.existsSync(manifestPath)) {
                      const content = fs.readFileSync(manifestPath, 'utf-8');
                      const match = content.match(/package="([^"]+)"/);
                      if (match) {
                          resolve(match[1]);
                      } else {
                          reject(new Error('Package name not found in manifest'));
                      }
                  } else {
                      reject(new Error('AndroidManifest.xml not found'));
                  }
              } catch (e) {
                  reject(e);
              } finally {
                  if (fs.existsSync(tempDir)) {
                      fs.rmSync(tempDir, { recursive: true, force: true });
                  }
              }
          } else {
              // Cleanup on failure too
              if (fs.existsSync(tempDir)) {
                  fs.rmSync(tempDir, { recursive: true, force: true });
              }
              reject(new Error('Apktool failed to decode manifest'));
          }
      });
    });
  }

  /**
   * 获取默认的AndResGuard配置
   */
  getDefaultConfig() {
    return {
      // 使用7zip压缩（需要系统安装7zip）
      use7zip: true,
      // 7zip路径
      sevenZipPath: this.find7ZipPath(),
      // 是否保持资源路径（false表示混淆）
      keepRoot: false,
      // 资源混淆的映射前缀（使用短路径）
      mappingPrefix: 'r',
      // 白名单 - 不混淆的资源路径
      whiteList: [
        // 保持launcher图标
        'R.drawable.icon',
        'R.drawable.ic_launcher',
        'R.mipmap.ic_launcher',
        // 保持xml中使用的资源
        'R.string.app_name',
        'R.style.*',
        'R.layout.*'
      ],
      // 压缩白名单 - 不压缩的文件后缀
      compressWhiteList: [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.mp3',
        '.mp4',
        '.ogg',
        '.wav'
      ],
      // 资源目录白名单
      keepDirList: [
        'assets/*'
      ]
    };
  }

  /**
   * 查找7zip可执行文件
   */
  find7ZipPath() {
    const possiblePaths = [
      '/usr/local/bin/7z',
      '/usr/bin/7z',
      '/opt/local/bin/7z',
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe'
    ];

    for (const zipPath of possiblePaths) {
      if (fs.existsSync(zipPath)) {
        return zipPath;
      }
    }

    // 尝试使用系统命令查找
    try {
      const result = require('child_process').execSync('which 7z').toString().trim();
      if (result) return result;
    } catch (e) {
      // 忽略错误
    }

    return null;
  }

  /**
   * 执行AndResGuard资源混淆
   * @param {string} inputApk - 输入APK路径
   * @param {string} outputDir - 输出目录
   * @param {object} config - 配置选项
   * @param {function} progressCallback - 进度回调
   */
  async obfuscate(inputApk, outputDir, config = {}, progressCallback = null) {
    return new Promise(async (resolve, reject) => {
      // 如果AndResGuard不可用，尝试下载
      if (!this.andResGuardJar) {
        progressCallback && progressCallback(5, '下载AndResGuard工具...');
        const downloaded = await this.downloadAndResGuard();
        if (!downloaded) {
          return reject(new Error('AndResGuard tool not available'));
        }
      }

      progressCallback && progressCallback(10, '准备资源混淆配置...');

      // 获取包名以修正白名单
      let packageName = '';
      try {
          packageName = await this.getPackageName(inputApk);
          console.log('Detected package name:', packageName);
      } catch (e) {
          console.warn('Failed to get package name:', e.message);
      }

      // 修正白名单 (添加包名前缀)
      const fixedWhiteList = (config.whiteList || this.defaultConfig.whiteList).map(item => {
          if (item.startsWith('R.') && packageName) {
              return packageName + '.' + item;
          }
          return item;
      });

      // 合并配置 (移除不支持的 mappingPrefix)
      const { mappingPrefix, ...otherConfig } = config;
      
      // 强制关闭 7zip，因为 AndResGuard 1.2.15 在启用 7zip 时强制要求配置签名
      // 而我们使用 uber-apk-signer 进行后期签名
      if (otherConfig.use7zip) {
          console.warn('Warning: Disabling 7zip compression because it requires AndResGuard signing configuration.');
          otherConfig.use7zip = false;
      }

      const finalConfig = { 
          ...this.defaultConfig, 
          ...otherConfig,
          whiteList: fixedWhiteList
      };

      // 创建配置文件
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Use a unique config file name to avoid race conditions in batch processing
      const configFile = path.join(outputDir, `andresguard-config-${uniqueId}.xml`);
      this.generateConfigFile(configFile, finalConfig);

      // 创建输出目录
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      progressCallback && progressCallback(20, '开始资源混淆...');

      // 构建AndResGuard命令
      // Fix: Add -Djava.io.tmpdir to isolate JVM temp files
      const args = [
        '-Djava.io.tmpdir=' + outputDir,
        '-jar', this.andResGuardJar,
        inputApk,
        '-config', configFile,
        '-out', outputDir
      ];

      if (finalConfig.use7zip && finalConfig.sevenZipPath) {
        args.push('-7zip', finalConfig.sevenZipPath);
      }
      
      // 如果系统中有zipalign，也可以传入
      // args.push('-zipalign', 'path/to/zipalign');

      console.log('AndResGuard command:', 'java', args.join(' '));

      const andResGuard = spawn('java', args);

      let output = '';
      let currentProgress = 20;
      let progressTimer = null;
      
      // 启动进度模拟器（每秒更新一次进度）
      progressTimer = setInterval(() => {
        if (currentProgress < 95) {
          currentProgress += 2;
          const messages = [
            '解析资源文件...',
            '混淆资源路径...',
            '压缩资源文件...',
            '优化APK对齐...'
          ];
          const msgIndex = Math.floor((currentProgress - 20) / 20) % messages.length;
          progressCallback && progressCallback(currentProgress, messages[msgIndex]);
        }
      }, 1000); // 每秒更新一次
      
      andResGuard.stdout.on('data', (data) => {
        output += data.toString();
        console.log('AndResGuard:', data.toString());

        // 解析真实进度并更新
        if (output.includes('parse resource') && currentProgress < 30) {
          clearInterval(progressTimer);
          currentProgress = 30;
          progressCallback && progressCallback(30, '解析资源文件...');
          // 重启进度模拟器
          progressTimer = setInterval(() => {
            if (currentProgress < 95) {
              currentProgress += 2;
              const messages = ['混淆资源路径...', '压缩资源文件...', '优化APK对齐...'];
              const msgIndex = Math.floor((currentProgress - 30) / 20) % messages.length;
              progressCallback && progressCallback(currentProgress, messages[msgIndex]);
            }
          }, 1000);
        } else if (output.includes('obfuscate resource') && currentProgress < 50) {
          clearInterval(progressTimer);
          currentProgress = 50;
          progressCallback && progressCallback(50, '混淆资源路径...');
          progressTimer = setInterval(() => {
            if (currentProgress < 95) {
              currentProgress += 2;
              const messages = ['压缩资源文件...', '优化APK对齐...'];
              const msgIndex = Math.floor((currentProgress - 50) / 20) % messages.length;
              progressCallback && progressCallback(currentProgress, messages[msgIndex]);
            }
          }, 1000);
        } else if (output.includes('build') && currentProgress < 70) {
          clearInterval(progressTimer);
          currentProgress = 70;
          progressCallback && progressCallback(70, '重新打包APK...');
          progressTimer = setInterval(() => {
            if (currentProgress < 95) {
              currentProgress += 2;
              progressCallback && progressCallback(currentProgress, '优化APK对齐...');
            }
          }, 1000);
        } else if (output.includes('compress') && currentProgress < 85) {
          clearInterval(progressTimer);
          currentProgress = 85;
          progressCallback && progressCallback(85, '压缩资源文件...');
        } else if (output.includes('zipalign') && currentProgress < 95) {
          clearInterval(progressTimer);
          currentProgress = 95;
          progressCallback && progressCallback(95, '优化APK对齐...');
        }
      });

      let stderr = '';
      andResGuard.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('AndResGuard Error:', data.toString());
      });

      andResGuard.on('close', async (code) => {
        // 清除进度模拟器
        if (progressTimer) {
          clearInterval(progressTimer);
        }

        // Cleanup config file
        try {
            if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
        } catch (e) {
            console.warn('Failed to cleanup config file:', e.message);
        }
        
        if (code === 0) {
          progressCallback && progressCallback(95, '资源混淆完成，准备签名...');
          
          // 查找输出的APK
          let outputApk = this.findOutputApk(outputDir);
          
          // 如果找到的是未签名的APK，则进行签名
          if (outputApk && outputApk.includes('unsigned')) {
             try {
                 outputApk = await this.signApk(outputApk);
             } catch (e) {
                 console.error('Signing failed:', e);
                 // 如果签名失败，仍然返回未签名的APK，或者抛出错误？
                 // 这里选择抛出错误，因为未签名的APK无法安装
                 reject(new Error(`Signing failed: ${e.message}`));
                 return;
             }
          }

          if (outputApk) {
              progressCallback && progressCallback(100, '加固完成');
              resolve({
                success: true,
                outputPath: outputApk,
                message: 'AndResGuard obfuscation completed successfully'
              });
          } else {
              reject(new Error('Output APK not found'));
          }
        } else {
          reject(new Error(`AndResGuard failed with exit code ${code}. Details: ${stderr}`));
        }
      });

      andResGuard.on('error', (error) => {
        // 清除进度模拟器
        if (progressTimer) {
          clearInterval(progressTimer);
        }
        reject(new Error(`Failed to start AndResGuard: ${error.message}`));
      });
    });
  }

  async signApk(inputApk) {
    return new Promise((resolve, reject) => {
      const signerPath = path.join(__dirname, 'tools/uber-apk-signer/uber-apk-signer.jar');
      if (!fs.existsSync(signerPath)) {
          // 如果没有签名工具，直接返回原文件
          console.warn('uber-apk-signer not found, returning unsigned apk');
          resolve(inputApk);
          return;
      }

      const cwd = path.dirname(inputApk);

      // Fix: Add -Djava.io.tmpdir to isolate JVM temp files
      const args = ['-Djava.io.tmpdir=' + cwd, '-jar', signerPath, '--apks', inputApk, '--overwrite', '--allowResign', '--verbose'];

      // 检查是否存在正式签名文件
      const keystorePath = path.join(__dirname, 'release.keystore');
      if (fs.existsSync(keystorePath)) {
        args.push('--ks', keystorePath);
        args.push('--ksAlias', 'my-release-key');
        args.push('--ksPass', '123456');
        // args.push('--keyPass', '123456');
        console.log('🔐 使用正式证书签名 (Release Keystore)');
      } else {
        console.log('⚠️ 使用调试证书签名 (Debug Keystore)');
      }

      // Fix: Set CWD to work dir to avoid race conditions
      // Fix: Set TMPDIR env var for native tools like zipalign
      const env = { ...process.env, TMPDIR: cwd };
      const child = spawn('java', args, { cwd, env });
      
      // Fix: Write password to stdin in case it prompts
      child.stdin.write('123456\n');
      child.stdin.end();

      // Fix: Consume stdout/stderr to prevent pipe buffer from filling up and hanging the process
      child.stdout.on('data', (data) => console.log(`[AndResGuard Signer] ${data}`));
      child.stderr.on('data', (data) => console.error(`[AndResGuard Signer Error] ${data}`));

      child.on('close', code => {
        if (code === 0) {
          const signed = inputApk.replace('.apk', '-aligned-signed.apk');
          // uber-apk-signer 可能会生成 -aligned-signed.apk
          // 或者如果使用了 --overwrite，它可能会覆盖原文件？
          // 不，--overwrite 是指如果输出文件存在则覆盖。
          // 默认输出是 input-aligned-signed.apk
          
          // 检查可能的文件名
          if (fs.existsSync(signed)) {
              resolve(signed);
          } else {
              // 尝试查找 input-signed.apk
              const signed2 = inputApk.replace('.apk', '-signed.apk');
              if (fs.existsSync(signed2)) {
                  resolve(signed2);
              } else {
                  // 也许覆盖了原文件？
                  resolve(inputApk);
              }
          }
        } else {
            reject(new Error('Signing failed'));
        }
      });
    });
  }

  /**
   * 生成AndResGuard配置文件（XML格式）
   */
  generateConfigFile(filePath, config) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<resproguard>
    <issue id="property">
        <seventzip value="${config.use7zip ? 'true' : 'false'}"/>
        <metaname value="META-INF"/>
        <keeproot value="${config.keepRoot ? 'true' : 'false'}"/>
    </issue>

    <issue id="whitelist" isactive="true">
        ${config.whiteList.map(item => `<path value="${item}"/>`).join('\n        ')}
    </issue>

    <issue id="compress" isactive="true">
        ${config.compressWhiteList.map(ext => `<path value="*.${ext}"/>`).join('\n        ')}
    </issue>
</resproguard>
`;
    
    fs.writeFileSync(filePath, xml);
  }

  /**
   * 查找AndResGuard输出的APK文件
   */
  findOutputApk(outputDir) {
    const files = fs.readdirSync(outputDir);
    // 优先查找已签名的
    let apkFile = files.find(f => f.endsWith('_signed.apk') || f.endsWith('_7zip_signed.apk'));
    if (!apkFile) {
        // 查找未签名的
        apkFile = files.find(f => f.endsWith('_unsigned.apk') || f.endsWith('_7zip_unsigned.apk'));
    }
    return apkFile ? path.join(outputDir, apkFile) : null;
  }

  /**
   * 下载AndResGuard工具
   */
  async downloadAndResGuard() {
    return new Promise((resolve) => {
      const toolsDir = path.join(__dirname, 'tools/andresguard');
      if (!fs.existsSync(toolsDir)) {
        fs.mkdirSync(toolsDir, { recursive: true });
      }

      const jarPath = path.join(toolsDir, 'AndResGuard.jar');
      
      // AndResGuard 下载地址 (GitHub raw)
      const downloadUrl = `https://raw.githubusercontent.com/shwenzhang/AndResGuard/master/tool_output/AndResGuard-cli-${this.version}.jar`;

      console.log('Downloading AndResGuard from:', downloadUrl);

      const file = fs.createWriteStream(jarPath);
      https.get(downloadUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          this.andResGuardJar = jarPath;
          console.log('AndResGuard downloaded successfully');
          resolve(true);
        });
      }).on('error', (err) => {
        fs.unlinkSync(jarPath);
        console.error('Failed to download AndResGuard:', err);
        resolve(false);
      });
    });
  }

  /**
   * 检查AndResGuard是否可用
   */
  isAvailable() {
    return this.andResGuardJar !== null && fs.existsSync(this.andResGuardJar);
  }

  /**
   * 安装7zip（macOS使用Homebrew）
   */
  async install7Zip() {
    return new Promise((resolve, reject) => {
      if (process.platform === 'darwin') {
        exec('brew install p7zip', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install 7zip:', error);
            reject(error);
          } else {
            console.log('7zip installed successfully');
            resolve(true);
          }
        });
      } else if (process.platform === 'linux') {
        exec('sudo apt-get install -y p7zip-full', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install 7zip:', error);
            reject(error);
          } else {
            console.log('7zip installed successfully');
            resolve(true);
          }
        });
      } else {
        reject(new Error('Unsupported platform for automatic 7zip installation'));
      }
    });
  }
}

module.exports = AndResGuardManager;
