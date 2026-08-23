#include "slam_benchmark/dataset_reader.hpp"

#include <rosbag_io/writer.hpp>
#include <rosbag_io/message/decoded_messages.hpp>
#include <rosbag_io/serialization/decoded_messages_serialization.hpp>

#include <cstddef>
#include <cstring>
#include <filesystem>
#include <string_view>
#include <stdexcept>
#include <type_traits>
#include <vector>

using namespace slam_benchmark;

namespace {

void expect(bool condition) {
    if (!condition) throw std::runtime_error("rosbag reader test expectation failed");
}

template <typename T>
void append(std::vector<std::byte>& data, T value, std::size_t origin = 4) {
    static_assert(std::is_trivially_copyable_v<T>);
    const std::size_t relative = data.size() - origin;
    const std::size_t padding = (sizeof(T) - relative % sizeof(T)) % sizeof(T);
    data.insert(data.end(), padding, std::byte{});
    const auto previous_size = data.size();
    data.resize(previous_size + sizeof(T));
    std::memcpy(data.data() + previous_size, &value, sizeof(T));
}

std::vector<std::byte> nav_sat_fix_cdr() {
    // Little-endian CDR encapsulation.
    std::vector<std::byte> data{std::byte{0}, std::byte{1}, std::byte{0}, std::byte{0}};
    append<std::int32_t>(data, 123);
    append<std::uint32_t>(data, 456);
    append<std::uint32_t>(data, 4);
    for (const char value : std::string_view{"gps\0", 4})
        data.push_back(static_cast<std::byte>(value));
    append<std::int8_t>(data, 0);
    append<std::uint16_t>(data, 1);
    append<double>(data, 22.3193);
    append<double>(data, 114.1694);
    append<double>(data, 12.5);
    for (int index = 0; index < 9; ++index) append<double>(data, index + 0.5);
    append<std::uint8_t>(data, 3);
    return data;
}

std::vector<std::byte> point_cloud_cdr() {
    rosbag_io::message::PointCloud2 cloud;
    cloud.height = 1;
    cloud.width = 2;
    cloud.fields = {
        {"x", 0, 7, 1}, {"y", 4, 7, 1}, {"z", 8, 7, 1},
        {"intensity", 12, 7, 1}, {"ring", 16, 4, 1}, {"time", 20, 7, 1},
    };
    cloud.point_step = 24;
    cloud.row_step = 48;
    cloud.data.resize(48);
    const auto set = [&](std::size_t offset, const auto& value) {
        std::memcpy(cloud.data.data() + offset, &value, sizeof(value));
    };
    set(0, 1.0F); set(4, 2.0F); set(8, 3.0F); set(12, 4.0F);
    set(16, std::uint16_t{5}); set(20, 0.001F);
    set(24, 6.0F); set(28, 7.0F); set(32, 8.0F); set(36, 9.0F);
    set(40, std::uint16_t{10}); set(44, 0.002F);
    return serialization::serialize_cdr(cloud);
}

}  // namespace

int main() {
    const auto path = std::filesystem::temp_directory_path() / "slam_benchmark_gnss.mcap";
    {
        rosbag_io::WriterOptions options;
        options.format = rosbag_io::BagFormat::Mcap;
        options.compression = rosbag_io::Compression::None;
        rosbag_io::Writer writer(path.string(), options);
        rosbag_io::TopicMetadata topic;
        topic.name = "/fix";
        topic.type = "sensor_msgs/msg/NavSatFix";
        topic.serialization_format = "cdr";
        writer.add_topic(topic);
        topic.name = "/points";
        topic.type = "sensor_msgs/msg/PointCloud2";
        writer.add_topic(topic);
        writer.write({.topic_name = "/fix", .receive_timestamp = 123000000456ULL,
                      .send_timestamp = 123000000456ULL, .data = nav_sat_fix_cdr()});
        writer.write({.topic_name = "/points", .receive_timestamp = 124000000000ULL,
                      .send_timestamp = 124000000000ULL, .data = point_cloud_cdr()});
        writer.close();
    }

    SensorDefinition sensor;
    sensor.id = 5;
    sensor.name = "gnss";
    sensor.type = SensorType::Gnss;
    sensor.topic = "/fix";
    sensor.message_type = "sensor_msgs/msg/NavSatFix";
    SensorDefinition lidar;
    lidar.id = 6;
    lidar.name = "lidar";
    lidar.type = SensorType::Lidar;
    lidar.topic = "/points";
    lidar.message_type = "sensor_msgs/msg/PointCloud2";
    lidar.point_time_field = "time";
    lidar.point_time_to_nanoseconds = 1e9;
    BagDefinition bag{"sensors", path, {sensor, lidar}};
    RosbagDatasetReader reader;
    int count = 0;
    reader.read(bag, [&](SensorSample&& sample) {
        ++count;
        if (sample.sensor_id == 5) {
            expect(sample.timestamp_ns == 123000000456ULL);
            const auto& fix = std::get<GnssFix>(sample.payload);
            expect(fix.status == 0);
            expect(fix.latitude_deg == 22.3193);
            expect(fix.longitude_deg == 114.1694);
            expect(fix.altitude_m == 12.5);
            expect(fix.position_covariance[8] == 8.5);
        } else {
            expect(sample.sensor_id == 6);
            const auto& cloud = std::get<PointCloud>(sample.payload);
            expect(cloud.points.size() == 2);
            expect(cloud.point_time_offset_ns.size() == 2);
            expect(cloud.points[1].x == 6.0F);
            expect(cloud.points[1].intensity == 9.0F);
            expect(cloud.points[1].ring == 10);
            expect(cloud.point_time_offset_ns[0] == 1000000);
            expect(cloud.point_time_offset_ns[1] == 2000000);
        }
    });
    expect(count == 2);
    std::filesystem::remove(path);
}
