#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <variant>
#include <vector>

namespace slam_benchmark {

using SensorId = std::uint32_t;
using TimestampNs = std::uint64_t;

enum class SensorType { Lidar, Imu, Camera, Gnss, WheelSpeed };

[[nodiscard]] constexpr const char* to_string(SensorType type) noexcept {
    switch (type) {
        case SensorType::Lidar: return "lidar";
        case SensorType::Imu: return "imu";
        case SensorType::Camera: return "camera";
        case SensorType::Gnss: return "gnss";
        case SensorType::WheelSpeed: return "wheel_speed";
    }
    return "unknown";
}

struct SensorCalibration {
    // Row-major transform from sensor frame to body frame.
    std::array<double, 16> body_from_sensor{
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    };
    std::vector<double> intrinsics;
    std::vector<double> distortion;
};

struct SensorDefinition {
    SensorId id{};
    std::string name;
    SensorType type{};
    std::string topic;
    std::string message_type;
    SensorCalibration calibration;
    // Filled by DatasetReader::inspect before algorithm initialization.
    bool available{true};
    std::string availability_reason;
    bool provides_point_time{true};
    bool provides_intensity{true};
    std::string point_time_field{"time"};
    std::string intensity_field{"intensity"};
    double point_time_to_nanoseconds{1.0};
    double distance_to_meters{1.0};
    double angular_velocity_to_rad_per_second{1.0};
    double acceleration_to_meters_per_second_squared{1.0};
};

struct PointXYZIR {
    float x{};
    float y{};
    float z{};
    // Raw sensor intensity/reflectivity. Dataset readers must populate it.
    float intensity{};
    std::uint16_t ring{};
};

struct PointCloud {
    std::vector<PointXYZIR> points;
    // One entry per point, relative to the message timestamp.
    std::vector<std::int64_t> point_time_offset_ns;
};

struct ImuSample {
    std::array<double, 3> angular_velocity_rad_s{};
    std::array<double, 3> linear_acceleration_m_s2{};
    std::array<double, 4> orientation_xyzw{0.0, 0.0, 0.0, 1.0};
};

struct ImageFrame {
    std::uint32_t width{};
    std::uint32_t height{};
    std::uint32_t row_stride{};
    std::string encoding;
    bool compressed{};
    std::vector<std::byte> data;
};

struct GnssFix {
    double latitude_deg{};
    double longitude_deg{};
    double altitude_m{};
    std::array<double, 9> position_covariance{};
    std::int8_t status{};
};

struct WheelSpeed {
    double linear_m_s{};
    double angular_rad_s{};
};

using SensorPayload = std::variant<PointCloud, ImuSample, ImageFrame, GnssFix, WheelSpeed>;

struct SensorSample {
    SensorId sensor_id{};
    TimestampNs timestamp_ns{};
    SensorPayload payload;
};

struct Pose {
    TimestampNs timestamp_ns{};
    std::array<double, 3> translation_m{};
    std::array<double, 4> rotation_xyzw{0.0, 0.0, 0.0, 1.0};
};

using Trajectory = std::vector<Pose>;

struct TimingSample {
    TimestampNs timestamp_ns{};
    std::string stage;
    double duration_ms{};
};

}  // namespace slam_benchmark
