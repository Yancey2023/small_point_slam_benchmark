add_executable(core_smoke_test core_smoke_test.cpp)
target_link_libraries(core_smoke_test PRIVATE slam_benchmark::core)
add_test(NAME core_smoke_test COMMAND core_smoke_test)

add_executable(dataset_manifest_test dataset_manifest_test.cpp)
target_link_libraries(dataset_manifest_test PRIVATE slam_benchmark::core)
add_test(NAME dataset_manifest_test COMMAND dataset_manifest_test)

if(TARGET rosbag_io)
    add_executable(rosbag_dataset_reader_test rosbag_dataset_reader_test.cpp)
    target_link_libraries(rosbag_dataset_reader_test PRIVATE slam_benchmark::core rosbag_io)
    add_test(NAME rosbag_dataset_reader_test COMMAND rosbag_dataset_reader_test)
endif()
