set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/Point-LIO")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR "Run scripts/download_algorithms.py point_lio and scripts/patch_algorithms.py apply point_lio")
endif()
add_subdirectory("${_source}" Point-LIO)

