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
    std::uint32_t image_width{};
    std::uint32_t image_height{};
};

struct SensorDefinition {
    SensorId id{};
    std::string name;
    SensorType type{};
    // Manifest switch. Disabled sensors are never inspected, selected, or replayed.
    bool enabled{true};
    // Larger values are preferred when an algorithm supports only one sensor
    // of a given type. Equal priorities preserve manifest order.
    int priority{};
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

struct GnssTime {
    std::uint32_t week{};
    double seconds_of_week{};
};

struct GnssObservation {
    GnssTime time;
    std::uint32_t satellite{};
    std::vector<double> frequencies_hz;
    std::vector<double> carrier_to_noise_db_hz;
    std::vector<std::uint8_t> lost_lock_indicators;
    std::vector<std::uint8_t> codes;
    std::vector<double> pseudoranges_m;
    std::vector<double> pseudorange_std_m;
    std::vector<double> carrier_phases_cycles;
    std::vector<double> carrier_phase_std_cycles;
    std::vector<double> doppler_hz;
    std::vector<double> doppler_std_hz;
    std::vector<std::uint8_t> tracking_status;
};

struct GnssObservations {
    std::vector<GnssObservation> observations;
};

struct GnssEphemeris {
    std::uint32_t satellite{};
    GnssTime transmission_time;
    GnssTime ephemeris_reference_time;
    GnssTime clock_reference_time;
    double ephemeris_reference_tow_s{};
    std::uint32_t week{};
    std::uint32_t issue_of_data_ephemeris{};
    std::uint32_t issue_of_data_clock{};
    std::uint32_t health{};
    std::uint32_t code{};
    double user_range_accuracy_m{};
    double semi_major_axis_m{};
    double eccentricity{};
    double inclination_rad{};
    double argument_of_perigee_rad{};
    double ascending_node_longitude_rad{};
    double mean_anomaly_rad{};
    double mean_motion_difference_rad_s{};
    double ascending_node_rate_rad_s{};
    double inclination_rate_rad_s{};
    double latitude_correction_cos_rad{};
    double latitude_correction_sin_rad{};
    double radius_correction_cos_m{};
    double radius_correction_sin_m{};
    double inclination_correction_cos_rad{};
    double inclination_correction_sin_rad{};
    double clock_bias_s{};
    double clock_drift_s_s{};
    double clock_drift_rate_s_s2{};
    double group_delay_0_s{};
    double group_delay_1_s{};
    double semi_major_axis_rate_m_s{};
    double mean_motion_rate_rad_s2{};
};

struct GnssGlonassEphemeris {
    std::uint32_t satellite{};
    GnssTime transmission_time;
    GnssTime ephemeris_reference_time;
    std::int32_t frequency_channel{};
    std::uint32_t issue_of_data{};
    std::uint32_t health{};
    std::uint32_t age_days{};
    double user_range_accuracy_m{};
    std::array<double, 3> position_m{};
    std::array<double, 3> velocity_m_s{};
    std::array<double, 3> acceleration_m_s2{};
    double clock_bias_s{};
    double relative_frequency_bias{};
    double inter_frequency_delay_s{};
};

struct GnssIonosphereParameters {
    TimestampNs source_timestamp_ns{};
    std::string frame_id;
    std::vector<double> values;
};

struct GnssReceiverPvt {
    GnssTime time;
    std::uint8_t fix_type{};
    bool valid_fix{};
    bool differential_solution{};
    std::uint8_t carrier_solution{};
    std::uint8_t satellites_used{};
    double latitude_deg{};
    double longitude_deg{};
    double altitude_m{};
    double height_mean_sea_level_m{};
    double horizontal_accuracy_m{};
    double vertical_accuracy_m{};
    double position_dop{};
    std::array<double, 3> velocity_ned_m_s{};
    double velocity_accuracy_m_s{};
};

struct WheelSpeed {
    double linear_m_s{};
    double angular_rad_s{};
};

using SensorPayload =
    std::variant<PointCloud, ImuSample, ImageFrame, GnssFix, GnssObservations,
                 GnssEphemeris, GnssGlonassEphemeris,
                 GnssIonosphereParameters, GnssReceiverPvt, WheelSpeed>;

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
