const { useBabelRc, override } = require('customize-cra');

module.exports = override(
  // Outras customizações podem vir aqui
  useBabelRc()  // Opcional, se precisar de .babelrc
);