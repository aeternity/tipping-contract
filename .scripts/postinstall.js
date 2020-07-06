const fs = require('fs');

const tippingInterface = fs.readFileSync(__dirname + '/../contracts/TippingInterface.aes', 'utf-8');

fs.writeFileSync(__dirname + '/../TippingInterface.aes.js', `module.exports = \`\n${tippingInterface}\`;\n`, 'utf-8');
