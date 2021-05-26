const fs = require('fs');

const tippingV1Interface = fs.readFileSync(__dirname + '/../contracts/v1/Tipping_v1_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v1_Interface.aes.js', `module.exports = \`\n${tippingV1Interface}\`;\n`, 'utf-8');

const tippingV1Getter = fs.readFileSync(__dirname + '/../contracts/v1/Tipping_v1_Getter.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v1_Getter.aes.js', `module.exports = \`\n${tippingV1Getter}\`;\n`, 'utf-8');

const tippingV2Interface = fs.readFileSync(__dirname + '/../contracts/v2/Tipping_v2_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v2_Interface.aes.js', `module.exports = \`\n${tippingV2Interface}\`;\n`, 'utf-8');

const tippingV2Getter = fs.readFileSync(__dirname + '/../contracts/v2/Tipping_v2_Getter.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v2_Getter.aes.js', `module.exports = \`\n${tippingV2Getter}\`;\n`, 'utf-8');

const tippingV3Interface = fs.readFileSync(__dirname + '/../contracts/v3/Tipping_v3_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v3_Interface.aes.js', `module.exports = \`\n${tippingV3Interface}\`;\n`, 'utf-8');

const tippingV3Getter = fs.readFileSync(__dirname + '/../contracts/v3/Tipping_v3_Getter.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v3_Getter.aes.js', `module.exports = \`\n${tippingV3Getter}\`;\n`, 'utf-8');

const tippingV4Interface = fs.readFileSync(__dirname + '/../contracts/v4/Tipping_v4_Interface.aes', 'utf-8');
fs.writeFileSync(__dirname + '/../Tipping_v4_Interface.aes.js', `module.exports = \`\n${tippingV4Interface}\`;\n`, 'utf-8');
