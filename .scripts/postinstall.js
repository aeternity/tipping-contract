const fs = require('fs');

const tippingV1Interface = fs.readFileSync(__dirname + '/../contracts/v1/Tipping_v1_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v1_Interface.aes.js', `module.exports = \`\n${tippingV1Interface}\`;\n`, 'utf-8');

const tippingV2Interface = fs.readFileSync(__dirname + '/../contracts/v2/Tipping_v2_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v2_Interface.aes.js', `module.exports = \`\n${tippingV2Interface}\`;\n`, 'utf-8');
