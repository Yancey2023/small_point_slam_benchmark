#include "slam_benchmark/dataset_reader.hpp"
#include "slam_benchmark/algorithm.hpp"

#include <rosbag_io/writer.hpp>
#include <rosbag_io/message/decoded_messages.hpp>
#include <rosbag_io/serialization/decoded_messages_serialization.hpp>

#include <cstddef>
#include <cstring>
#include <filesystem>
#include <algorithm>
#include <array>
#include <sstream>
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
        {"reflectivity", 12, 7, 1}, {"ring", 16, 4, 1}, {"time", 20, 7, 1},
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

template <typename T>
void append_ros1(std::vector<std::byte>& data, const T& value) {
    static_assert(std::is_trivially_copyable_v<T>);
    const auto offset = data.size();
    data.resize(offset + sizeof(T));
    std::memcpy(data.data() + offset, &value, sizeof(T));
}

template <typename T>
void append_ros1_vector(std::vector<std::byte>& data,
                        std::initializer_list<T> values) {
    append_ros1(data, static_cast<std::uint32_t>(values.size()));
    for (const auto value : values) append_ros1(data, value);
}

std::vector<std::byte> gnss_observations_ros1() {
    std::vector<std::byte> data;
    append_ros1(data, std::uint32_t{1});  // one satellite
    append_ros1(data, std::uint32_t{2200});
    append_ros1(data, 123.5);
    append_ros1(data, std::uint32_t{7});
    append_ros1_vector<double>(data, {1575.42e6});
    append_ros1_vector<double>(data, {45.0});
    append_ros1_vector<std::uint8_t>(data, {0});
    append_ros1_vector<std::uint8_t>(data, {1});
    append_ros1_vector<double>(data, {20'000'001.0});
    append_ros1_vector<double>(data, {0.5});
    append_ros1_vector<double>(data, {100.0});
    append_ros1_vector<double>(data, {0.01});
    append_ros1_vector<double>(data, {-1000.0});
    append_ros1_vector<double>(data, {0.1});
    append_ros1_vector<std::uint8_t>(data, {3});
    return data;
}

void probe_gnss_dataset(const std::filesystem::path& manifest_path,
                        const std::string& bag_name) {
    const auto manifest = load_dataset_manifest(manifest_path);
    BagDefinition bag = find_bag(manifest, bag_name);
    std::erase_if(bag.sensors, [](const SensorDefinition& sensor) {
        return sensor.type != SensorType::Gnss;
    });
    RosbagDatasetReader reader;
    bag.sensors = reader.inspect(bag);
    std::array<bool, 5> expected{};
    for (const auto& sensor : bag.sensors) {
        if (!sensor.available) continue;
        const auto& message_type = bag.sensor_inputs.at(sensor.id).message_type;
        if (message_type.ends_with("GnssMeasMsg")) expected[0] = true;
        if (message_type.ends_with("GnssEphemMsg")) expected[1] = true;
        if (message_type.ends_with("GnssGloEphemMsg")) expected[2] = true;
        if (message_type.ends_with("StampedFloat64Array")) expected[3] = true;
        if (message_type.ends_with("GnssPVTSolnMsg")) expected[4] = true;
    }
    std::erase_if(bag.sensors, [](const SensorDefinition& sensor) {
        return !sensor.available;
    });
    std::array<std::size_t, 5> counts{};
    reader.read(bag, [&](SensorSample&& sample) {
        if (std::holds_alternative<GnssObservations>(sample.payload)) ++counts[0];
        if (std::holds_alternative<GnssEphemeris>(sample.payload)) ++counts[1];
        if (std::holds_alternative<GnssGlonassEphemeris>(sample.payload)) ++counts[2];
        if (std::holds_alternative<GnssIonosphereParameters>(sample.payload)) ++counts[3];
        if (std::holds_alternative<GnssReceiverPvt>(sample.payload)) ++counts[4];
    });
    bool missing = false;
    for (std::size_t index = 0; index < counts.size(); ++index)
        missing = missing || (expected[index] && counts[index] == 0);
    if (missing) {
        std::ostringstream reason;
        reason << "GNSS probe counts observations=" << counts[0]
               << ", ephemeris=" << counts[1] << ", glonass=" << counts[2]
               << ", ionosphere=" << counts[3] << ", pvt=" << counts[4];
        throw std::runtime_error(reason.str());
    }
}

}  // namespace

int main(int argc, char** argv) {
    if (argc == 3) {
        probe_gnss_dataset(argv[1], argv[2]);
        return 0;
    }
    expect(argc == 1);
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
    SensorDefinition lidar;
    lidar.id = 6;
    lidar.name = "lidar";
    lidar.type = SensorType::Lidar;
    lidar.point_time_field = "time";
    lidar.intensity_field = "reflectivity";
    lidar.point_time_to_nanoseconds = 1e9;
    lidar.timestamp_offset_ns = 100;
    BagDefinition bag{
        "sensors", path, {sensor, lidar},
        {{5, {"/fix", "sensor_msgs/msg/NavSatFix"}},
         {6, {"/points", "sensor_msgs/msg/PointCloud2"}}}};
    RosbagDatasetReader reader;
    const auto inspected = reader.inspect(bag);
    expect(inspected.size() == 2);
    expect(inspected[0].available);
    expect(inspected[1].available);
    expect(inspected[1].provides_point_time);
    expect(inspected[1].provides_intensity);
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
            expect(sample.timestamp_ns == 124000000100ULL);
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

    const auto raw_gnss_path =
        std::filesystem::temp_directory_path() / "slam_benchmark_raw_gnss.mcap";
    {
        rosbag_io::WriterOptions options;
        options.format = rosbag_io::BagFormat::Mcap;
        options.compression = rosbag_io::Compression::None;
        rosbag_io::Writer writer(raw_gnss_path.string(), options);
        rosbag_io::TopicMetadata observations_topic;
        observations_topic.name = "/observations";
        observations_topic.type = "gnss_comm/GnssMeasMsg";
        observations_topic.serialization_format = "ros1";
        writer.add_topic(observations_topic);
        writer.write({.topic_name = "/observations",
                      .receive_timestamp = 125000000000ULL,
                      .send_timestamp = 125000000000ULL,
                      .data = gnss_observations_ros1()});
        writer.close();
    }
    SensorDefinition observations_sensor;
    observations_sensor.id = 7;
    observations_sensor.name = "raw GNSS observations";
    observations_sensor.type = SensorType::Gnss;
    BagDefinition raw_gnss_bag{
        "raw_gnss", raw_gnss_path, {observations_sensor},
        {{7, {"/observations", "gnss_comm/GnssMeasMsg"}}}};
    const auto inspected_raw_gnss = reader.inspect(raw_gnss_bag);
    expect(inspected_raw_gnss.front().available);
    reader.read(raw_gnss_bag, [](SensorSample&& sample) {
        const auto& observations = std::get<GnssObservations>(sample.payload);
        expect(observations.observations.size() == 1);
        expect(observations.observations.front().satellite == 7);
        expect(observations.observations.front().pseudoranges_m.front() ==
               20'000'001.0);
    });

    lidar.intensity_field = "missing_intensity";
    BagDefinition missing_intensity{
        "missing_intensity", path, {lidar},
        {{6, {"/points", "sensor_msgs/msg/PointCloud2"}}}};
    missing_intensity.sensors = reader.inspect(missing_intensity);
    expect(!missing_intensity.sensors[0].provides_intensity);
    expect(!check_dataset_compatibility(
        missing_intensity.sensors, {.lidar = true, .intensity = true}));
    reader.read(missing_intensity, [](SensorSample&& sample) {
        const auto& cloud = std::get<PointCloud>(sample.payload);
        expect(cloud.points[1].intensity == 0.0F);
    });

    std::filesystem::remove(path);
    std::filesystem::remove(raw_gnss_path);
}
