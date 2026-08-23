#pragma once

#include "slam_benchmark/types.hpp"

#include <filesystem>
#include <fstream>
#include <mutex>
#include <string_view>

namespace slam_benchmark {

class CsvWriter {
public:
    CsvWriter() = default;
    CsvWriter(const std::filesystem::path& path, std::string_view header);
    CsvWriter(CsvWriter&& other) noexcept;
    CsvWriter& operator=(CsvWriter&& other) noexcept;
    CsvWriter(const CsvWriter&) = delete;
    CsvWriter& operator=(const CsvWriter&) = delete;

    void row(std::string_view line);
    void flush();

private:
    std::ofstream stream_;
    std::mutex mutex_;
};

[[nodiscard]] std::string csv_escape(std::string_view value);

}  // namespace slam_benchmark

