set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/Super-LIO")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR "Run scripts/download_algorithms.py super_lio and scripts/patch_algorithms.py apply super_lio")
endif()
add_subdirectory("${_source}" Super-LIO)

