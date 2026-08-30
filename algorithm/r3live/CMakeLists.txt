set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/r3live")
if(NOT EXISTS "${_source}/standalone/main.cpp")
    message(FATAL_ERROR
        "Run scripts/download_algorithms.py r3live and "
        "scripts/patch_algorithms.py apply r3live")
endif()
add_subdirectory("${_source}" r3live)
