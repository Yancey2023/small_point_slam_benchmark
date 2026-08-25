if(NOT TARGET small_point_slam_lio_mode_benchmark)
    add_subdirectory(
        "${CMAKE_CURRENT_SOURCE_DIR}/../small_point_slam"
        "${CMAKE_CURRENT_BINARY_DIR}/small_point_slam_shared")
endif()
