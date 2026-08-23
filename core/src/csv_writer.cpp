#include "slam_benchmark/csv_writer.hpp"

#include <stdexcept>
#include <utility>

namespace slam_benchmark {

CsvWriter::CsvWriter(const std::filesystem::path& path, std::string_view header) {
    if (!path.parent_path().empty()) {
        std::filesystem::create_directories(path.parent_path());
    }
    stream_.open(path, std::ios::out | std::ios::trunc);
    if (!stream_) {
        throw std::runtime_error("cannot open CSV file: " + path.string());
    }
    stream_ << header << '\n';
}

CsvWriter::CsvWriter(CsvWriter&& other) noexcept {
    std::scoped_lock lock(other.mutex_);
    stream_ = std::move(other.stream_);
}

CsvWriter& CsvWriter::operator=(CsvWriter&& other) noexcept {
    if (this != &other) {
        std::scoped_lock lock(mutex_, other.mutex_);
        stream_ = std::move(other.stream_);
    }
    return *this;
}

void CsvWriter::row(std::string_view line) {
    std::lock_guard lock(mutex_);
    stream_ << line << '\n';
}

void CsvWriter::flush() {
    std::lock_guard lock(mutex_);
    stream_.flush();
}

std::string csv_escape(std::string_view value) {
    const bool quote = value.find_first_of(",\"\r\n") != std::string_view::npos;
    if (!quote) return std::string(value);
    std::string result{"\""};
    for (const char c : value) {
        if (c == '\"') result.push_back('\"');
        result.push_back(c);
    }
    result.push_back('\"');
    return result;
}

}  // namespace slam_benchmark

