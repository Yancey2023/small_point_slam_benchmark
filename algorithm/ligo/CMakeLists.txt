set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/LIGO.")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR "Run scripts/download_algorithms.py ligo and scripts/patch_algorithms.py apply ligo")
endif()
if(NOT EXISTS "${_source}/standalone/main.cpp")
    message(WARNING
        "LIGO is registered but the current core GNSS schema cannot carry its "
        "raw GNSS observations; ligo_benchmark will not be built")
    return()
endif()
add_subdirectory("${_source}" ligo)
