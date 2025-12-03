const fs = require('fs');
const path = require('path');

// APK加固工具类 - 集成增强版Smali混淆 + AndResGuard
class ApkHardenerSimple {
  constructor(progressCallback = null) {
    this.progressCallback = progressCallback;
    this.tempDir = path.join(__dirname, 'temp');
    this.startTime = Date.now();
  }

  reportProgress(step, progress, message, details = {}) {
    const elapsed = Date.now() - this.startTime;
    
    // 进度权重分配
    const stepWeights = {
      'start': { base: 0, weight: 0 },
      'obfuscate': { base: 0, weight: 40 },     // 0-40%
      'packer': { base: 40, weight: 30 },       // 40-70% (DEX加壳)
      'andresguard': { base: 70, weight: 30 },  // 70-100%
      'complete': { base: 100, weight: 0 }
    };
    
    let overallProgress = 0;
    if (stepWeights[step]) {
      overallProgress = stepWeights[step].base + (progress / 100) * stepWeights[step].weight;
    }
    
    const progressData = {
      step,
      progress: Math.min(progress, 100),
      overallProgress: Math.min(Math.round(overallProgress), 100),
      message,
      elapsed,
      ...details
    };

    console.log(`[${step}] ${progress}% (总进度: ${progressData.overallProgress}%) - ${message}`);

    if (this.progressCallback) {
      this.progressCallback(progressData);
    }
  }

  // 清理临时文件
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('清理临时文件失败:', error.message);
    }
  }

  async hardenApk(inputApkPath, outputApkPath, originalFileName = null, options = {}) {
    // 默认开启加壳
    const usePacker = options.usePacker !== false;
    const skipObfuscation = options.skipObfuscation === true;
    const skipAndResGuard = options.skipAndResGuard === true;

    // 创建日志文件
    const baseNameForLog = originalFileName 
      ? path.basename(originalFileName, '.apk')
      : path.basename(outputApkPath, '.apk');
    const logFileName = `harden_${baseNameForLog}_${Date.now()}.log`;
    const logFilePath = path.join(__dirname, 'logs', logFileName);
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = logFilePath;
    this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    
    const log = (message) => {
      console.log(message);
      if (this.logStream) {
        this.logStream.write(`${message}\n`);
      }
    };
    this.log = log;
    
    const features = [];
    if (!skipObfuscation) features.push('Smali控制流混淆');
    if (usePacker) features.push('DEX加壳 (V1)');
    features.push('AndResGuard资源混淆');

    const stats = {
      startTime: Date.now(),
      originalSize: fs.statSync(inputApkPath).size,
      features: features,
      version: 'Advanced-v3.0 (Packer)',
      logFile: logFileName
    };

    // 临时文件路径
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    const intermediateApkPath = path.join(this.tempDir, 'intermediate.apk');
    const packedApkPath = path.join(this.tempDir, 'packed.apk');

    try {
      this.reportProgress('start', 0, '开始APK加固流程...');
      log('\n╔════════════════════════════════════════════════════════════════╗');
      log('║  APK 高级加固工具 (Smali + Packer + AndResGuard)              ║');
      log('╚════════════════════════════════════════════════════════════════╝');
      log(`📦 输入APK: ${path.basename(inputApkPath)}`);
      log(`📁 输出路径: ${outputApkPath}`);
      log(`⚙️  启用加壳: ${usePacker ? '是' : '否'}`);
      log(`⚙️  启用混淆: ${!skipObfuscation ? '是' : '否'}`);
      log(`📄 日志文件: ${logFileName}\n`);

      let nextInputApk = inputApkPath;

      // 1. Smali 代码混淆
      if (!skipObfuscation) {
        this.reportProgress('obfuscate', 0, '准备进行Smali代码混淆...');
        log('\n[Step 1/3] Smali 代码混淆 (控制流混淆 + 字符串加密)...');
        
        const SmaliObfuscator = require('./smali-obfuscator.cjs');
        const obfuscator = new SmaliObfuscator();
        
        await obfuscator.obfuscate(
          inputApkPath,
          intermediateApkPath,
          {},
          (progress, msg) => {
            this.reportProgress('obfuscate', progress, msg);
            log(`[Smali] ${progress}% - ${msg}`);
          }
        );
        nextInputApk = intermediateApkPath;
        log('✅ Smali代码混淆完成');
      } else {
        this.reportProgress('obfuscate', 100, '跳过Smali混淆');
        log('\n[Step 1/3] 跳过 Smali 代码混淆');
      }

      // 2. DEX 加壳 (可选)
      if (usePacker) {
        this.reportProgress('packer', 0, '准备进行DEX加壳...');
        log('\n[Step 2/3] DEX 加壳 (隐藏源码)...');
        
        const DexPacker = require('./dex-packer.cjs');
        const packer = new DexPacker();
        
        // 检查apktool
        if (!packer.findApktoolJar()) {
           log('⚠️ 未找到apktool.jar，跳过加壳步骤');
        } else {
           await packer.pack(
             nextInputApk,
             packedApkPath,
             (progress, msg) => {
               this.reportProgress('packer', progress, msg);
               log(`[Packer] ${progress}% - ${msg}`);
             }
           );
           nextInputApk = packedApkPath;
           log('✅ DEX加壳完成');
        }
      } else {
        this.reportProgress('packer', 100, '跳过加壳步骤');
        log('\n[Step 2/3] 跳过 DEX 加壳');
      }

      // 3. AndResGuard 资源混淆
      if (!skipAndResGuard) {
        this.reportProgress('andresguard', 0, '准备进行AndResGuard资源混淆...');
        log('\n[Step 3/3] AndResGuard 资源混淆...');
        
        const AndResGuardManager = require('./andresguard-manager.cjs');
        const andresguard = new AndResGuardManager();
        
        // 检查工具是否可用
        if (!andresguard.isAvailable()) {
          this.reportProgress('andresguard', 10, '下载AndResGuard工具...');
          const downloaded = await andresguard.downloadAndResGuard();
          if (!downloaded) {
            throw new Error('无法下载AndResGuard工具');
          }
        }
        
        this.reportProgress('andresguard', 20, '开始资源混淆和压缩...');
        
        const outputDir = path.dirname(outputApkPath);
        // 使用上一步的输出作为输入
        const result = await andresguard.obfuscate(
          nextInputApk,
          outputDir,
          {
            use7zip: true,
            keepRoot: false,
            mappingPrefix: 'r',
            whiteList: [
              // --- 关键资源白名单 (防止启动崩溃) ---
              
              // 1. 应用图标 (Launcher Icons) - 必须保留
              'R.drawable.icon',
              'R.drawable.ic_launcher',
              'R.drawable.ic_launcher_round',
              'R.mipmap.ic_launcher',
              'R.mipmap.ic_launcher_round',
              'R.mipmap.ic_launcher_foreground',
              'R.mipmap.ic_launcher_background',
              
              // 2. 应用名称
              'R.string.app_name',
              
              // 3. 主题与样式 (混淆主题常导致Activity启动失败)
              'R.style.*',
              
              // 4. 布局文件 (防止反射加载布局失败)
              'R.layout.*',
              
              // 5. 动画与原生资源
              'R.anim.*',
              'R.raw.*',
              'R.menu.*',
              
              // 6. 保持所有字符串引用 (防止动态获取字符串失败)
              'R.string.*',
              
              // 7. 保持ID (防止findViewById失败，虽然会增加体积但最安全)
              'R.id.*',
              
              // 8. 保持所有资源名称 (彻底解决 getIdentifier 问题)
              // 如果应用使用了大量反射获取资源，这是必须的
              'R.drawable.*',
              'R.color.*',
              'R.dimen.*',
              'R.integer.*',
              'R.bool.*',
              'R.array.*',
              'R.xml.*',
              
              // 9. 关键修复：保持自定义属性 (attr) 和 styleable
              // 防止自定义 View (如 ClearableEditText) 无法获取属性值导致崩溃
              'R.attr.*',
              'R.styleable.*',
              
              // 10. 终极白名单：包含所有可能的资源类型
              'R.mipmap.*',
              'R.plurals.*',
              'R.fraction.*',
              'R.interpolator.*',
              'R.transition.*'
            ]
          },
          (progress, msg) => {
            this.reportProgress('andresguard', progress, msg);
            log(`[AndResGuard] ${progress}% - ${msg}`);
          }
        );
        
        // 将AndResGuard输出的APK复制到目标路径
        if (result.success && result.outputPath) {
          if (result.outputPath !== outputApkPath) {
            fs.copyFileSync(result.outputPath, outputApkPath);
            
            // 🧹 清理 AndResGuard 生成的中间文件，防止历史记录出现重复
            try {
                if (fs.existsSync(result.outputPath)) {
                    fs.unlinkSync(result.outputPath);
                }
                // 尝试清理可能存在的未签名版本
                const unsignedPath = result.outputPath.replace('-aligned-signed.apk', '_unsigned.apk')
                                                      .replace('-signed.apk', '_unsigned.apk');
                if (fs.existsSync(unsignedPath)) {
                    fs.unlinkSync(unsignedPath);
                }
            } catch (e) {
                console.warn('清理中间文件失败:', e.message);
            }
          }
          log(`✅ AndResGuard处理完成: ${result.outputPath}`);
        }
      } else {
        this.reportProgress('andresguard', 100, '跳过AndResGuard资源混淆');
        log('\n[Step 3/3] 跳过 AndResGuard 资源混淆');
        // 如果跳过AndResGuard，直接将上一步的结果复制到输出路径
        if (nextInputApk !== outputApkPath) {
           fs.copyFileSync(nextInputApk, outputApkPath);
        }
      }
      
      // 显示最终统计
      const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
      const finalSize = fs.statSync(outputApkPath).size;
      const sizeChange = (((finalSize - stats.originalSize) / stats.originalSize) * 100).toFixed(1);
      const sizeChangeStr = sizeChange > 0 ? `+${sizeChange}%` : `${sizeChange}%`;
      
      log('\n╔════════════════════════════════════════════════════════════════╗');
      log('║  ✨ 加固全部完成！                                            ║');
      log('╚════════════════════════════════════════════════════════════════╝');
      log(`\n📊 处理结果:`);
      log(`   ✅ Smali控制流混淆 (防jadx)`);
      if (usePacker) log(`   ✅ DEX加壳 (隐藏源码)`);
      log(`   ✅ 资源路径混淆`);
      log(`   ✅ APK体积优化`);
      log(`\n⏱️  总耗时: ${duration}秒`);
      log(`📏 体积变化: ${sizeChangeStr}`);
      log(`💾 原始大小: ${(stats.originalSize / 1024 / 1024).toFixed(2)}MB`);
      log(`💾 最终大小: ${(finalSize / 1024 / 1024).toFixed(2)}MB\n`);

      this.reportProgress('complete', 100, `加固完成！体积变化: ${sizeChangeStr}`);
      
      if (this.logStream) {
        this.logStream.end();
      }
      
      return stats;

    } catch (error) {
      this.reportProgress('error', 0, `加固失败: ${error.message}`);
      log(`❌ 加固失败: ${error.message}`);
      console.error('❌ 加固失败:', error);
      
      if (this.logStream) {
        this.logStream.end();
      }
      
      throw error;
    } finally {
      this.cleanup();
    }
  }
}

module.exports = ApkHardenerSimple;
