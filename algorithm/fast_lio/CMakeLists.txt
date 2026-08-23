set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/FAST_LIO")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR "Run scripts/download_algorithms.py fast_lio and scripts/patch_algorithms.py apply fast_lio")
endif()
add_subdirectory("${_source}" FAST_LIO)

