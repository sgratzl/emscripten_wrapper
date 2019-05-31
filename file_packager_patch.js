
function filePackagerPatch_getPreloadedPackageNode(filename) {
    var fs = require('fs');
    var path = require('path');
    filename = path.normalize(path.resolve(__dirname, filename));
    const buf = fs.readFileSync(filename);
    // convert to ArrayBuffer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function filePackagerPatch_isNodeOrShell() {
    var ENVIRONMENT_IS_WEB = typeof window === 'object';
    var ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
    var ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
    var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
    return ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL;
}

if (filePackagerPatch_isNodeOrShell()) {
    // create a fake location to overrule the file_packager
    var location = {
        pathname: '/'
    };
    Module.getPreloadedPackage = Module.getPreloadedPackage || filePackagerPatch_getPreloadedPackageNode;
}