set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/fast_livo2")
if(NOT EXISTS "${_source}/standalone/main.cpp")
    message(FATAL_ERROR
        "Run scripts/download_algorithms.py fast_livo2 and "
        "scripts/patch_algorithms.py apply fast_livo2")
endif()
add_subdirectory("${_source}" fast_livo2)
