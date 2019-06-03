## emcc build

preload files with patch for node and shell environments:

docker prefix: `docker run --rm -v ${pwd}:/src trzeci/emscripten`
```
python /emsdk_portable/sdk/tools/file_packager.py helloworld.data --preload ./share --from-emcc --js-output=file_packager.js
// wasm
emcc helloworld.cpp --pre-js file_packager_patch.js --pre-js file_packager.js -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap', 'FS']" -o helloworld.js
// asm only 
emcc helloworld.cpp --pre-js file_packager_patch.js --pre-js file_packager.js -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap', 'FS']" -s WASM=0 -o helloworld.js
```

CMAKE
```bash
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=/emsdk_portable/sdk/cmake/Modules/Platform/Emscripten.cmake
make
```
