cmake_minimum_required(VERSION 3.14)
project(helloworld)

# SET(CMAKE_BUILD_TYPE "Release")
set(CMAKE_CXX_STANDARD 11)

file(GLOB SOURCES "*.cpp")

add_executable(helloworld ${SOURCES})

if (DEFINED EMSCRIPTEN)
  em_link_pre_js(helloworld "file_packager_patch.js")
  em_link_pre_js(helloworld "file_packager.js")

  set_target_properties(helloworld PROPERTIES LINK_FLAGS " -std=c++11 -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS=\"['cwrap', 'FS']\"")
  set_target_properties(helloworld PROPERTIES LINK_FLAGS_RELEASE "-O2")
endif()

add_executable(helloworld_asm ${SOURCES})

if (DEFINED EMSCRIPTEN)
  add_custom_command(OUTPUT ${PROJECT_BINARY_DIR}/CMakeFiles/file_packager.js
                  COMMAND python ${EMSCRIPTEN_ROOT_PATH}/tools/file_packager.py helloworld.data --preload ${PROJECT_SOURCE_DIR}/share --from-emcc --js-output=${PROJECT_BINARY_DIR}/CMakeFiles/file_packager.js
                  COMMENT "building data store minizinc.data")
  em_link_pre_js(helloworld_asm "file_packager_patch.js")
  em_link_pre_js(helloworld_asm ${PROJECT_BINARY_DIR}/CMakeFiles/file_packager.js)

  set_target_properties(helloworld_asm PROPERTIES LINK_FLAGS " -std=c++11 -s WASM=0 -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 -s EXTRA_EXPORTED_RUNTIME_METHODS=\"['cwrap', 'FS']\"")
  set_target_properties(helloworld_asm PROPERTIES LINK_FLAGS_RELEASE "-O2")
endif()
