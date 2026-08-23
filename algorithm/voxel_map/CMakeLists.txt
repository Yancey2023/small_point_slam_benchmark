set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/VoxelMap")
if(NOT EXISTS "${_source}/CMakeLists.txt")
    message(FATAL_ERROR "Run scripts/download_algorithms.py voxel_map and scripts/patch_algorithms.py apply voxel_map")
endif()
add_subdirectory("${_source}" VoxelMap)

