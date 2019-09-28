Emscripten Wrapper
============
[![License: MIT][mit-image]][mit-url] [![NPM version][npm-image]][npm-url]  [![Github Actions][github-actions-image]][github-actions-url]

This is a helper repository to wrap an [Emscripten](http://emscripten.org/) generated module such that it is easier useable. 
 
Installation
------------

```bash
npm install emscripten_wrapper
npm install github:sgratzl/emscripten_wrapper
```

Prerequisites
-------------

In order to work the Emscripten module has to be compiled with at least the following flags

```bash
 -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap', 'FS', 'ENV']"
```

e.g. 
```bash
emcc helloworld.cpp -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap', 'FS', 'ENV']" -o helloworld.js
```

This ensures that the FileSystem (`FS`) and `crwap` (to call custom functions) are available while also enforcing that emcc outputs a module. 

**!!!Important**

the `file_packager.py` file that is currently used (e.g. when using `--preload_file`), doesn't work in node environments by default. There is a patch file included in this repo `file_packager_patch.js` that fixes this issue. However, since it has to be applied before the code of the `file_packager.py`, one need to manually bundle the files. 

such as

```bash
python /emsdk_portable/sdk/tools/file_packager.py helloworld.data --preload ./share --from-emcc --js-output=file_packager.js
emcc helloworld.cpp --pre-js file_packager_patch.js --pre-js file_packager.js -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap', 'FS', 'ENV']" -o helloworld.js
```

Usage
-----

```js
import createWrapper from 'emscripten_wrapper';

const wrapper = createWrapper(() => import('./helloworld.js'), {
  functions: {
    add_values: { returnType: 'number', arguments: ['number', 'number']}
  }
});

export default wrapper;
```

TypeScript
```ts
import createWrapper, {IAsyncEMWMainWrapper} from 'emscripten_wrapper';

export interface IHelloWorldFunctions {
  add_values(a: number, b: number): number;
}

export interface IHelloWorldModule extends IAsyncEMWMainWrapper<IHelloWorldFunctions> {

}

const wrapper: IHelloWorldModule = createWrapper<IHelloWorldFunctions>(() => import('./helloworld'), {
  functions: {
    add_values: {
      arguments: ['number', 'number'],
      returnType: 'number'
    }
  }
});

export default wrapper;
```

you also need to define a `helloworld.d.ts` with the following content:

```ts
import {IEMScriptModule} from 'emscripten_wrapper';

declare const loader: IEMScriptModule;

export default loader;
```

the createdWrapper is of following the interface `IAsyncEMWMainWrapper` defined in `index.ts`. It is inspired by the `child_process` interface. 

important methods
 * `.main(args?: string[]): Promise<number>`
   execute the main function and returns a promise when done. In case of an error (status code not 0) the promise will be rejected with the error
 * `.run(args?: string[]): Promise<{stdout: string, stderr: string, exitCode: number, error?: Error}>`
   similar to `.main` but returns an object with combined output information similar to `subprocess.run` from Python
 * `.fileSystem: Promise<EMScriptFS>`
   lazy access to the filesystem of Emscripten
 * `.environmentVariables: {[key: string]: string}`
   access to set virtual environment variables
 * `.fn.${functioname}(${arguments}): Promise<$returnType>`
   provides easy access to all the defined functions, e.g. for the example above there would be an `.fn.add_values(a: number, b: number): Promise<number>` function
 * `.sync(): Promise<ISyncEMWWrapper>`
   loads and waits till the module is ready, returning a sync version of the interface. e.g. `.FileSystem` won't return a promise but directly the file system. So do `.main`, and alll `.fn` functions. 
   e.g. the signature changes to `.fn.add_values(a: number, b: number): number`
 * `.stdout.on(event: 'data', listener: (chunk: string) => void)`
   to listen to stdout outputs
 * `.stderr.on(event: 'data', listener: (chunk: string) => void)`
   to listen to stdout outputs


**TODO**


[npm-image]: https://badge.fury.io/js/emscripten_wrapper.svg
[npm-url]: https://npmjs.org/package/emscripten_wrapper
[mit-image]: https://img.shields.io/badge/License-MIT-yellow.svg
[mit-url]: https://opensource.org/licenses/MIT
[github-actions-image]: https://github.com/sgratzl/emscripten_wrapper/workflows/nodeci/badge.svg
[github-actions-url]: https://github.com/sgratzl/emscripten_wrapper/actions

