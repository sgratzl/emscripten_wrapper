#ifdef EMSCRIPTEN
  #include <emscripten.h>
  #define EXPORT EMSCRIPTEN_KEEPALIVE
#else
  #define EXPORT
#endif

#include <iostream>
#include <fstream>

extern "C" {
    int EXPORT add_values(int v1, int v2) {
    return v1 + v2;
    }
}

int main() { 
    std::cout << "hello world" << std::endl; 

    std::ifstream f("share/file.txt");
    if (f.is_open()) {
        std::cout << f.rdbuf() << std::endl;
    }

    return 0;
}
