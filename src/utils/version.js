const packageJson = require('../../package.json');

const getVersion = () => {
  return packageJson.version;
};

module.exports = {
  getVersion,
};
