#include "slam_benchmark/dataset_reader.hpp"

#include <rosbag_io/message_decoder.hpp>
#include <rosbag_io/reader.hpp>

#include <algorithm>
#include <bit>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <stdexcept>
#include <string_view>

namespace slam_benchmark {
namespace {

template <typename T> T byte_swap(T value) {
  static_assert(std::is_trivially_copyable_v<T>);
  std::array<std::byte, sizeof(T)> source{};
  std::array<std::byte, sizeof(T)> target{};
  std::memcpy(source.data(), &value, sizeof(T));
  std::reverse_copy(source.begin(), source.end(), target.begin());
  std::memcpy(&value, target.data(), sizeof(T));
  return value;
}

template <typename T> T read_scalar(const std::uint8_t *data, bool big_endian) {
  T value{};
  std::memcpy(&value, data, sizeof(T));
  if ((std::endian::native == std::endian::little) == big_endian &&
      sizeof(T) > 1)
    value = byte_swap(value);
  return value;
}

double field_value(const std::uint8_t *data, std::uint8_t datatype,
                   bool big_endian) {
  switch (datatype) {
  case 1:
    return read_scalar<std::int8_t>(data, big_endian);
  case 2:
    return read_scalar<std::uint8_t>(data, big_endian);
  case 3:
    return read_scalar<std::int16_t>(data, big_endian);
  case 4:
    return read_scalar<std::uint16_t>(data, big_endian);
  case 5:
    return read_scalar<std::int32_t>(data, big_endian);
  case 6:
    return read_scalar<std::uint32_t>(data, big_endian);
  case 7:
    return read_scalar<float>(data, big_endian);
  case 8:
    return read_scalar<double>(data, big_endian);
  default:
    throw std::runtime_error("unsupported PointCloud2 field datatype");
  }
}

std::size_t datatype_size(std::uint8_t datatype) {
  switch (datatype) {
  case 1:
  case 2:
    return 1;
  case 3:
  case 4:
    return 2;
  case 5:
  case 6:
  case 7:
    return 4;
  case 8:
    return 8;
  default:
    throw std::runtime_error("unsupported PointCloud2 field datatype");
  }
}

const rosbag_io::message::PointField *
find_field(const rosbag_io::message::PointCloud2 &cloud, std::string_view name,
           bool required) {
  const auto it = std::ranges::find(cloud.fields, name,
                                    &rosbag_io::message::PointField::name);
  if (it == cloud.fields.end()) {
    if (required)
      throw std::runtime_error("PointCloud2 is missing field: " +
                               std::string(name));
    return nullptr;
  }
  if (it->offset + datatype_size(it->datatype) > cloud.point_step)
    throw std::runtime_error("PointCloud2 field extends beyond point_step");
  return &*it;
}

PointCloud convert_cloud(const rosbag_io::message::PointCloud2 &input,
                         const SensorDefinition &sensor) {
  const auto *x = find_field(input, "x", true);
  const auto *y = find_field(input, "y", true);
  const auto *z = find_field(input, "z", true);
  const auto *intensity = sensor.provides_intensity
                              ? find_field(input, sensor.intensity_field, false)
                              : nullptr;
  const auto *ring = find_field(input, "ring", false);
  const auto *time = sensor.provides_point_time
                         ? find_field(input, sensor.point_time_field, false)
                         : nullptr;
  const std::size_t count =
      static_cast<std::size_t>(input.width) * input.height;
  const std::size_t minimum_row_size =
      static_cast<std::size_t>(input.width) * input.point_step;
  if (input.point_step == 0 || input.row_step < minimum_row_size ||
      input.data.size() < static_cast<std::size_t>(input.height) * input.row_step)
    throw std::runtime_error("invalid PointCloud2 data size");

  PointCloud output;
  output.points.reserve(count);
  output.point_time_offset_ns.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    const std::size_t row = i / input.width;
    const std::size_t column = i % input.width;
    const auto *point = input.data.data() + row * input.row_step +
                        column * input.point_step;
    PointXYZIR converted;
    converted.x = static_cast<float>(
        field_value(point + x->offset, x->datatype, input.is_bigendian) *
        sensor.distance_to_meters);
    converted.y = static_cast<float>(
        field_value(point + y->offset, y->datatype, input.is_bigendian) *
        sensor.distance_to_meters);
    converted.z = static_cast<float>(
        field_value(point + z->offset, z->datatype, input.is_bigendian) *
        sensor.distance_to_meters);
    if (intensity)
      converted.intensity = static_cast<float>(field_value(
          point + intensity->offset, intensity->datatype, input.is_bigendian));
    if (ring)
      converted.ring = static_cast<std::uint16_t>(field_value(
          point + ring->offset, ring->datatype, input.is_bigendian));
    output.points.push_back(converted);
    output.point_time_offset_ns.push_back(time ? static_cast<std::int64_t>(
        std::llround(field_value(point + time->offset, time->datatype,
                                 input.is_bigendian) *
                     sensor.point_time_to_nanoseconds)) : 0);
  }
  return output;
}

PointCloud convert_livox(const rosbag_io::message::LivoxCustomMessage &input,
                         const SensorDefinition &sensor) {
  PointCloud output;
  output.points.reserve(input.points.size());
  output.point_time_offset_ns.reserve(input.points.size());
  for (const auto &point : input.points) {
    output.points.push_back({
        static_cast<float>(point.x * sensor.distance_to_meters),
        static_cast<float>(point.y * sensor.distance_to_meters),
        static_cast<float>(point.z * sensor.distance_to_meters),
        static_cast<float>(point.reflectivity),
        point.line,
    });
    output.point_time_offset_ns.push_back(static_cast<std::int64_t>(
        std::llround(static_cast<double>(point.offset_time) *
                     sensor.point_time_to_nanoseconds)));
  }
  return output;
}

ImageFrame raw_image(const rosbag_io::message::Image &input) {
  ImageFrame output;
  output.width = input.width;
  output.height = input.height;
  output.row_stride = input.step;
  output.encoding = input.encoding;
  output.data.resize(input.data.size());
  std::memcpy(output.data.data(), input.data.data(), input.data.size());
  return output;
}

ImageFrame compressed_image(const rosbag_io::message::CompressedImage &input) {
  ImageFrame output;
  output.encoding = input.format;
  output.compressed = true;
  output.data.resize(input.data.size());
  std::memcpy(output.data.data(), input.data.data(), input.data.size());
  return output;
}

GnssTime convert_gnss_time(const rosbag_io::message::GnssTime &input) {
  return {input.week, input.seconds_of_week};
}

GnssObservation convert_gnss_observation(
    const rosbag_io::message::GnssObservation &input) {
  return {
      .time = convert_gnss_time(input.time),
      .satellite = input.satellite,
      .frequencies_hz = input.frequencies_hz,
      .carrier_to_noise_db_hz = input.carrier_to_noise_db_hz,
      .lost_lock_indicators = input.lost_lock_indicators,
      .codes = input.codes,
      .pseudoranges_m = input.pseudoranges_m,
      .pseudorange_std_m = input.pseudorange_std_m,
      .carrier_phases_cycles = input.carrier_phases_cycles,
      .carrier_phase_std_cycles = input.carrier_phase_std_cycles,
      .doppler_hz = input.doppler_hz,
      .doppler_std_hz = input.doppler_std_hz,
      .tracking_status = input.tracking_status,
  };
}

GnssObservations convert_gnss_observations(
    const rosbag_io::message::GnssObservations &input) {
  GnssObservations output;
  output.observations.reserve(input.observations.size());
  for (const auto &observation : input.observations)
    output.observations.push_back(convert_gnss_observation(observation));
  return output;
}

GnssEphemeris convert_gnss_ephemeris(
    const rosbag_io::message::GnssEphemeris &input) {
  return {
      .satellite = input.satellite,
      .transmission_time = convert_gnss_time(input.transmission_time),
      .ephemeris_reference_time =
          convert_gnss_time(input.ephemeris_reference_time),
      .clock_reference_time = convert_gnss_time(input.clock_reference_time),
      .ephemeris_reference_tow_s = input.ephemeris_reference_tow_s,
      .week = input.week,
      .issue_of_data_ephemeris = input.issue_of_data_ephemeris,
      .issue_of_data_clock = input.issue_of_data_clock,
      .health = input.health,
      .code = input.code,
      .user_range_accuracy_m = input.user_range_accuracy_m,
      .semi_major_axis_m = input.semi_major_axis_m,
      .eccentricity = input.eccentricity,
      .inclination_rad = input.inclination_rad,
      .argument_of_perigee_rad = input.argument_of_perigee_rad,
      .ascending_node_longitude_rad = input.ascending_node_longitude_rad,
      .mean_anomaly_rad = input.mean_anomaly_rad,
      .mean_motion_difference_rad_s = input.mean_motion_difference_rad_s,
      .ascending_node_rate_rad_s = input.ascending_node_rate_rad_s,
      .inclination_rate_rad_s = input.inclination_rate_rad_s,
      .latitude_correction_cos_rad = input.latitude_correction_cos_rad,
      .latitude_correction_sin_rad = input.latitude_correction_sin_rad,
      .radius_correction_cos_m = input.radius_correction_cos_m,
      .radius_correction_sin_m = input.radius_correction_sin_m,
      .inclination_correction_cos_rad = input.inclination_correction_cos_rad,
      .inclination_correction_sin_rad = input.inclination_correction_sin_rad,
      .clock_bias_s = input.clock_bias_s,
      .clock_drift_s_s = input.clock_drift_s_s,
      .clock_drift_rate_s_s2 = input.clock_drift_rate_s_s2,
      .group_delay_0_s = input.group_delay_0_s,
      .group_delay_1_s = input.group_delay_1_s,
      .semi_major_axis_rate_m_s = input.semi_major_axis_rate_m_s,
      .mean_motion_rate_rad_s2 = input.mean_motion_rate_rad_s2,
  };
}

GnssGlonassEphemeris convert_gnss_glonass_ephemeris(
    const rosbag_io::message::GnssGlonassEphemeris &input) {
  return {
      .satellite = input.satellite,
      .transmission_time = convert_gnss_time(input.transmission_time),
      .ephemeris_reference_time =
          convert_gnss_time(input.ephemeris_reference_time),
      .frequency_channel = input.frequency_channel,
      .issue_of_data = input.issue_of_data,
      .health = input.health,
      .age_days = input.age_days,
      .user_range_accuracy_m = input.user_range_accuracy_m,
      .position_m = input.position_m,
      .velocity_m_s = input.velocity_m_s,
      .acceleration_m_s2 = input.acceleration_m_s2,
      .clock_bias_s = input.clock_bias_s,
      .relative_frequency_bias = input.relative_frequency_bias,
      .inter_frequency_delay_s = input.inter_frequency_delay_s,
  };
}

TimestampNs timestamp_ns(const rosbag_io::message::Time &time) {
  if (time.sec < 0)
    throw std::runtime_error("negative GNSS header timestamp");
  return static_cast<TimestampNs>(time.sec) * 1'000'000'000ULL + time.nanosec;
}

GnssIonosphereParameters convert_gnss_ionosphere(
    const rosbag_io::message::GnssIonosphereParameters &input) {
  return {
      .source_timestamp_ns = timestamp_ns(input.header.stamp),
      .frame_id = input.header.frame_id,
      .values = input.values,
  };
}

GnssReceiverPvt convert_gnss_receiver_pvt(
    const rosbag_io::message::GnssReceiverPvt &input) {
  return {
      .time = convert_gnss_time(input.time),
      .fix_type = input.fix_type,
      .valid_fix = input.valid_fix,
      .differential_solution = input.differential_solution,
      .carrier_solution = input.carrier_solution,
      .satellites_used = input.satellites_used,
      .latitude_deg = input.latitude_deg,
      .longitude_deg = input.longitude_deg,
      .altitude_m = input.altitude_m,
      .height_mean_sea_level_m = input.height_mean_sea_level_m,
      .horizontal_accuracy_m = input.horizontal_accuracy_m,
      .vertical_accuracy_m = input.vertical_accuracy_m,
      .position_dop = input.position_dop,
      .velocity_ned_m_s = input.velocity_ned_m_s,
      .velocity_accuracy_m_s = input.velocity_accuracy_m_s,
  };
}

SensorPayload decode_custom_gnss(const rosbag_io::SerializedMessage &message,
                                 const rosbag_io::TopicMetadata &topic,
                                 std::string_view message_type) {
  if (message_type.ends_with("GnssMeasMsg"))
    return convert_gnss_observations(rosbag_io::decode_gnss_observations(
        message.data, topic.serialization_format));
  if (message_type.ends_with("GnssEphemMsg"))
    return convert_gnss_ephemeris(rosbag_io::decode_gnss_ephemeris(
        message.data, topic.serialization_format));
  if (message_type.ends_with("GnssGloEphemMsg"))
    return convert_gnss_glonass_ephemeris(
        rosbag_io::decode_gnss_glonass_ephemeris(
            message.data, topic.serialization_format));
  if (message_type.ends_with("StampedFloat64Array"))
    return convert_gnss_ionosphere(
        rosbag_io::decode_gnss_ionosphere_parameters(
            message.data, topic.serialization_format));
  if (message_type.ends_with("GnssPVTSolnMsg"))
    return convert_gnss_receiver_pvt(rosbag_io::decode_gnss_receiver_pvt(
        message.data, topic.serialization_format));
  throw std::runtime_error("unsupported GNSS message type: " +
                           std::string(message_type));
}

SensorPayload decode(const rosbag_io::SerializedMessage &message,
                     const rosbag_io::TopicMetadata &topic,
                     const SensorDefinition &sensor,
                     const SensorInputBinding &binding) {
  switch (sensor.type) {
  case SensorType::Lidar:
    if (binding.message_type.find("CustomMsg") != std::string::npos) {
      return convert_livox(rosbag_io::decode_livox_custom_message(
                               message.data, topic.serialization_format),
                           sensor);
    }
    return convert_cloud(rosbag_io::decode_point_cloud2(
                             message.data, topic.serialization_format),
                         sensor);
  case SensorType::Imu: {
    const auto value =
        rosbag_io::decode_imu(message.data, topic.serialization_format);
    return ImuSample{
        {value.angular_velocity.x * sensor.angular_velocity_to_rad_per_second,
         value.angular_velocity.y * sensor.angular_velocity_to_rad_per_second,
         value.angular_velocity.z * sensor.angular_velocity_to_rad_per_second},
        {value.linear_acceleration.x *
             sensor.acceleration_to_meters_per_second_squared,
         value.linear_acceleration.y *
             sensor.acceleration_to_meters_per_second_squared,
         value.linear_acceleration.z *
             sensor.acceleration_to_meters_per_second_squared},
        {value.orientation.x, value.orientation.y, value.orientation.z,
         value.orientation.w},
    };
  }
  case SensorType::Camera:
    if (binding.message_type.find("CompressedImage") != std::string::npos)
      return compressed_image(rosbag_io::decode_compressed_image(
          message.data, topic.serialization_format));
    return raw_image(
        rosbag_io::decode_image(message.data, topic.serialization_format));
  case SensorType::WheelSpeed: {
    const auto value =
        rosbag_io::decode_odometry(message.data, topic.serialization_format);
    return WheelSpeed{value.twist.twist.linear.x * sensor.distance_to_meters,
                      value.twist.twist.angular.z *
                          sensor.angular_velocity_to_rad_per_second};
  }
  case SensorType::Gnss: {
    if (binding.message_type.find("NavSatFix") == std::string::npos)
      return decode_custom_gnss(message, topic, binding.message_type);
    const auto value =
        rosbag_io::decode_nav_sat_fix(message.data, topic.serialization_format);
    return GnssFix{value.latitude, value.longitude, value.altitude,
                   value.position_covariance, value.status.status};
  }
  }
  throw std::runtime_error("unreachable sensor type");
}

TimestampNs adjusted_timestamp(TimestampNs timestamp, std::int64_t offset_ns) {
  if (offset_ns >= 0) {
    const auto offset = static_cast<TimestampNs>(offset_ns);
    if (timestamp > std::numeric_limits<TimestampNs>::max() - offset)
      throw std::runtime_error("sensor timestamp offset overflows");
    return timestamp + offset;
  }
  const auto magnitude = static_cast<TimestampNs>(-(offset_ns + 1)) + 1;
  if (timestamp < magnitude)
    throw std::runtime_error("sensor timestamp offset underflows");
  return timestamp - magnitude;
}

} // namespace

std::vector<SensorDefinition>
RosbagDatasetReader::inspect(const BagDefinition &bag) {
  std::vector<SensorDefinition> sensors = bag.sensors;
  rosbag_io::Reader reader(bag.path.string());

  std::map<std::string, const rosbag_io::TopicMetadata *, std::less<>> topics;
  for (const auto &topic : reader.topics())
    topics.emplace(topic.name, &topic);

  std::map<std::string, SensorDefinition *, std::less<>> pending;
  for (auto &sensor : sensors) {
    if (!sensor.enabled) {
      sensor.available = false;
      sensor.availability_reason = "传感器已在 manifest 中禁用";
      continue;
    }
    const auto binding_it = bag.sensor_inputs.find(sensor.id);
    if (binding_it == bag.sensor_inputs.end())
      throw std::runtime_error("missing core topic binding for sensor id " +
                               std::to_string(sensor.id));
    const auto &binding = binding_it->second;
    const auto &topic_name = binding.topic;
    sensor.available = topics.contains(topic_name);
    sensor.availability_reason.clear();
    if (!sensor.available) {
      sensor.availability_reason = std::string(to_string(sensor.type)) +
                                   " 数据在 bag 中不存在";
      continue;
    }
    if (sensor.type == SensorType::Lidar) {
      sensor.provides_point_time = false;
      sensor.provides_intensity = false;
    }
    pending.emplace(topic_name, &sensor);
  }

  while (!pending.empty() && reader.has_next()) {
    const auto message = reader.read_next();
    const auto sensor_it = pending.find(message.topic_name);
    if (sensor_it == pending.end()) continue;
    SensorDefinition &sensor = *sensor_it->second;
    try {
      const auto topic_it = topics.find(message.topic_name);
      const auto &binding = bag.sensor_inputs.at(sensor.id);
      if (sensor.type == SensorType::Lidar) {
        if (binding.message_type.find("CustomMsg") != std::string::npos) {
          sensor.provides_point_time = true;
          sensor.provides_intensity = true;
        } else {
          const auto cloud = rosbag_io::decode_point_cloud2(
              message.data, topic_it->second->serialization_format);
          sensor.provides_point_time =
              find_field(cloud, sensor.point_time_field, false) != nullptr;
          sensor.provides_intensity =
              find_field(cloud, sensor.intensity_field, false) != nullptr;
        }
      }
      // Validate small structured messages before the algorithm starts. Avoid
      // materializing a full image or Livox cloud during the probe because the
      // allocator could retain that memory and bias the benchmark RSS.
      if (sensor.type == SensorType::Imu || sensor.type == SensorType::Gnss ||
          sensor.type == SensorType::WheelSpeed)
        (void)decode(message, *topic_it->second, sensor, binding);
    } catch (const std::exception &error) {
      sensor.available = false;
      sensor.availability_reason =
          std::string("无法检查 ") + to_string(sensor.type) + " 消息：" +
          error.what();
    }
    pending.erase(sensor_it);
  }

  for (const auto &[topic, sensor] : pending) {
    (void)topic;
    sensor->available = false;
    sensor->availability_reason =
        std::string(to_string(sensor->type)) + " 数据流没有消息";
  }
  return sensors;
}

void RosbagDatasetReader::read(const BagDefinition &bag,
                               const SampleCallback &callback) {
  rosbag_io::Reader reader(bag.path.string());
  std::map<std::string, const SensorDefinition *, std::less<>> sensors;
  for (const auto &sensor : bag.sensors) {
    const auto binding = bag.sensor_inputs.find(sensor.id);
    if (binding == bag.sensor_inputs.end())
      throw std::runtime_error("missing core topic binding for sensor id " +
                               std::to_string(sensor.id));
    sensors.emplace(binding->second.topic, &sensor);
  }

  std::map<std::string, const rosbag_io::TopicMetadata *, std::less<>> topics;
  for (const auto &topic : reader.topics())
    topics.emplace(topic.name, &topic);
  for (const auto &[topic_name, sensor] : sensors) {
    (void)sensor;
    if (!topics.contains(topic_name))
      throw std::runtime_error("configured topic is absent from bag: " +
                               topic_name);
  }

  while (reader.has_next()) {
    auto serialized = reader.read_next();
    const auto sensor_it = sensors.find(serialized.topic_name);
    if (sensor_it == sensors.end())
      continue;
    const auto topic_it = topics.find(serialized.topic_name);
    const auto &sensor = *sensor_it->second;
    const auto &binding = bag.sensor_inputs.at(sensor.id);
    const TimestampNs timestamp = serialized.send_timestamp != 0
                                      ? serialized.send_timestamp
                                      : serialized.receive_timestamp;
    callback(SensorSample{sensor.id,
                          adjusted_timestamp(timestamp, sensor.timestamp_offset_ns),
                          decode(serialized, *topic_it->second, sensor,
                                 binding)});
  }
}

} // namespace slam_benchmark
