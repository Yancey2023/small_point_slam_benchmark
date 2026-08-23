set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/navigation/standalone")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR
        "Run scripts/download_algorithms.py small_point_slam and "
        "scripts/patch_algorithms.py apply small_point_slam")
endif()
add_subdirectory("${_source}" navigation)
