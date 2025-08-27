const fs = require('fs');
const path = require('path');

console.log('开始合并文件...');
console.log('当前目录:', __dirname);

// 读取 HTML 文件
const htmlPath = path.join(__dirname, 'vn_panel.html');
console.log('HTML 文件路径:', htmlPath);

if (!fs.existsSync(htmlPath)) {
    console.error('❌ 找不到 HTML 文件:', htmlPath);
    process.exit(1);
}

let htmlContent = fs.readFileSync(htmlPath, 'utf8');
console.log('✅ HTML 文件读取成功');

// 需要内联的 JS 文件列表
const jsFiles = [
    'vntype-core-base.js',
    'vntype-features-audio.js',
    'vntype-features-special.js',
    'vntype-ui-dialogue.js',
    'vntype-character-scene.js',
    'vn_background_generator.js',
    'material-window.js',
    'material-settings-clean.js',
    'calltype-listeners.js',
    'chattype-listeners.js',
    'echotype-listeners.js',
    'livestreamtype-listeners.js'
];

// 需要内联的 CSS 文件列表
const cssFiles = [
    'vn_style.css',
    'vn_landing_style.css',
    'vn_startup_styles.css',
    'calltype-style.css',
    'chattype-style.css',
    'echotype-style.css',
    'livestreamtype-style.css',
    'material-settings-style.css'
];

console.log('\n=== 处理 JS 文件 ===');
let jsCount = 0;

// 内联 JS 文件
jsFiles.forEach(jsFile => {
    const jsPath = path.join(__dirname, jsFile);
    if (fs.existsSync(jsPath)) {
        console.log(`✅ 内联 JS: ${jsFile}`);
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        const scriptTag = `<script src="${jsFile}"></script>`;
        const inlineScript = `<script>\n${jsContent}\n</script>`;
        
        if (htmlContent.includes(scriptTag)) {
            htmlContent = htmlContent.replace(scriptTag, inlineScript);
            jsCount++;
        } else {
            console.log(`⚠️  在 HTML 中找不到: ${scriptTag}`);
        }
    } else {
        console.log(`❌ 找不到文件: ${jsFile}`);
    }
});

console.log(`\n=== 处理 CSS 文件 ===`);
let cssCount = 0;

// 内联 CSS 文件
cssFiles.forEach(cssFile => {
    const cssPath = path.join(__dirname, cssFile);
    if (fs.existsSync(cssPath)) {
        console.log(`✅ 内联 CSS: ${cssFile}`);
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const linkTag = `<link rel="stylesheet" href="${cssFile}">`;
        const inlineStyle = `<style>\n${cssContent}\n</style>`;
        
        if (htmlContent.includes(linkTag)) {
            htmlContent = htmlContent.replace(linkTag, inlineStyle);
            cssCount++;
        } else {
            console.log(`⚠️  在 HTML 中找不到: ${linkTag}`);
        }
    } else {
        console.log(`❌ 找不到文件: ${cssFile}`);
    }
});

// 写入合并后的文件
const outputPath = path.join(__dirname, 'vn_panel_single.html');
fs.writeFileSync(outputPath, htmlContent, 'utf8');

console.log(`\n=== 合并完成 ===`);
console.log(`✅ 输出文件: ${outputPath}`);
console.log(`📊 内联了 ${jsCount} 个 JS 文件和 ${cssCount} 个 CSS 文件`);
console.log(`📏 文件大小: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
