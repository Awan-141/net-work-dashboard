"use client"

import type React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  File,
  Image,
  Video,
  FileText,
  Archive,
  Wifi,
  NetworkIcon as Ethernet,
  NetworkIcon as PeerToPeer,
  ArrowRight,
} from "lucide-react"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts"

type FileUnit = "bytes" | "KB" | "MB" | "GB" | "TB"

const units: FileUnit[] = ["bytes", "KB", "MB", "GB", "TB"]

const unitSizes: Record<FileUnit, number> = {
  bytes: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
}

interface FileData {
  name: string
  size: number
  unit: FileUnit
  type: string
}

// Accurate conversion functions
const convertToBytes = (size: number, unit: FileUnit): number => size * unitSizes[unit]

const convertFromBytes = (bytes: number): { size: number; unit: FileUnit } => {
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return { size: Number.parseFloat(size.toFixed(2)), unit: units[unitIndex] }
}

// Core formula for calculating file transfer time (in seconds)
// File Size (bits) / Transfer Speed (bits per second)
const calculateTime = (fileSizeBytes: number, speedMbps: number): number => {
  // Convert file size from bytes to bits
  const fileSizeBits = fileSizeBytes * 8
  // Convert speed from Mbps to bps (1 Mbps = 1,000,000 bps)
  const speedBps = speedMbps * 1000000
  // Calculate time in seconds
  return fileSizeBits / speedBps
}

export function FileTransferEstimator() {
  const [files, setFiles] = useState<FileData[]>([])
  const [manualFileSize, setManualFileSize] = useState<number>(100)
  const [manualFileUnit, setManualFileUnit] = useState<FileUnit>("MB")
  const [downloadSpeed, setDownloadSpeed] = useState<number>(10)
  const [uploadSpeed, setUploadSpeed] = useState<number>(5)
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(false)
  const [compressionRate, setCompressionRate] = useState<number>(50)
  const [downloadTime, setDownloadTime] = useState<number>(0)
  const [uploadTime, setUploadTime] = useState<number>(0)
  const [networkLatency, setNetworkLatency] = useState<number>(50)
  const [currentBandwidth, setCurrentBandwidth] = useState<number>(0)
  const [cloudProvider, setCloudProvider] = useState<string>("none")
  const [cloudUploadTime, setCloudUploadTime] = useState<number>(0)
  const [isVpnEnabled, setIsVpnEnabled] = useState<boolean>(false)
  const [connectionType, setConnectionType] = useState<"wifi" | "ethernet" | "bluetooth" | "4g" | "5g">("wifi")
  const [transferType, setTransferType] = useState<"direct" | "p2p">("direct")
  const [uncompressedSize, setUncompressedSize] = useState<number>(0)
  const [compressedSize, setCompressedSize] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [calculationDetails, setCalculationDetails] = useState<string>("")

  // Medium speed factors (relative to base speed)
  const mediumFactors: Record<string, number> = {
    bluetooth: 0.3, // Slower - Bluetooth typically maxes at 2-3 Mbps
    wifi: 1.0, // Base reference
    ethernet: 1.5, // Faster - Wired connections are more stable and often faster
    "4g": 0.5, // Mobile network - Variable but generally slower than WiFi
    "5g": 1.2, // Fast mobile network - Can be faster than standard WiFi
  }

  // Cloud provider speed factors
  const cloudSpeedFactors: Record<string, number> = {
    none: 1,
    "google-drive": 0.9, // Google Drive has some throttling
    "aws-s3": 1.1, // AWS S3 often has good upload speeds
    onedrive: 0.95, // OneDrive is slightly slower than base
    dropbox: 0.85, // Dropbox has more aggressive throttling
  }

  // Simulate bandwidth monitoring for realistic fluctuations
  const simulateBandwidthMonitoring = useCallback(() => {
    const baseBandwidth = (downloadSpeed + uploadSpeed) / 2
    const fluctuation = Math.random() * 0.2 - 0.1 // -10% to +10% fluctuation
    setCurrentBandwidth(baseBandwidth * (1 + fluctuation))
  }, [downloadSpeed, uploadSpeed])

  useEffect(() => {
    const intervalId = setInterval(simulateBandwidthMonitoring, 5000) // Update every 5 seconds
    return () => clearInterval(intervalId)
  }, [simulateBandwidthMonitoring])

  // Calculate effective speed based on selected medium and VPN status
  const getEffectiveSpeed = useCallback(
    (baseSpeed: number): number => {
      let effectiveSpeed = baseSpeed * mediumFactors[connectionType]

      if (isVpnEnabled) {
        effectiveSpeed *= 0.8 // VPN overhead reduces speed by 20%
      }

      if (transferType === "p2p") {
        effectiveSpeed *= 0.85 // P2P overhead
      }

      return effectiveSpeed
    },
    [connectionType, isVpnEnabled, transferType],
  )

  // Calculate transfer time with latency
  const calculateTimeWithLatency = useCallback(
    (fileSizeBytes: number, speedMbps: number): number => {
      // Base transfer time
      const baseTime = calculateTime(fileSizeBytes, speedMbps)

      // Calculate packet count (assuming 1500 byte packets, which is common MTU size)
      const packetSize = 1500 // bytes
      const packetCount = Math.ceil(fileSizeBytes / packetSize)

      // Latency effect (converted from ms to s) - affects each packet
      // For large files, this is negligible, but for small files it matters
      const latencyEffect = (networkLatency / 1000) * Math.min(packetCount, 10)

      return baseTime + latencyEffect
    },
    [networkLatency],
  )

  // Estimate cloud upload time
  const estimateCloudUploadTime = useCallback(
    (fileSizeBytes: number): number => {
      const effectiveSpeed = getEffectiveSpeed(uploadSpeed) * cloudSpeedFactors[cloudProvider]
      return calculateTimeWithLatency(fileSizeBytes, effectiveSpeed)
    },
    [getEffectiveSpeed, uploadSpeed, cloudProvider, calculateTimeWithLatency],
  )

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const fileData = selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      unit: "bytes" as FileUnit,
      type: file.type,
    }))
    setFiles(fileData)

    // Update manual file size input based on the total size of selected files
    if (selectedFiles.length > 0) {
      const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0)
      const { size, unit } = convertFromBytes(totalBytes)
      setManualFileSize(size)
      setManualFileUnit(unit)
    }
  }

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    const fileData = droppedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      unit: "bytes" as FileUnit,
      type: file.type,
    }))
    setFiles(fileData)

    // Update manual file size input based on the total size of dropped files
    if (droppedFiles.length > 0) {
      const totalBytes = droppedFiles.reduce((sum, file) => sum + file.size, 0)
      const { size, unit } = convertFromBytes(totalBytes)
      setManualFileSize(size)
      setManualFileUnit(unit)
    }
  }

  // Calculate transfer times
  const handleEstimate = () => {
    // Calculate total file size in bytes
    let totalSizeBytes = 0

    if (files.length > 0) {
      // Use actual files if available
      totalSizeBytes = files.reduce((sum, file) => sum + convertToBytes(file.size, file.unit), 0)
    } else {
      // Use manual input if no files are selected
      totalSizeBytes = convertToBytes(manualFileSize, manualFileUnit)
    }

    setUncompressedSize(totalSizeBytes)

    // Calculate compressed size if compression is enabled
    let effectiveSizeBytes = totalSizeBytes
    if (compressionEnabled) {
      effectiveSizeBytes = totalSizeBytes * (1 - compressionRate / 100)
      setCompressedSize(effectiveSizeBytes)
    } else {
      setCompressedSize(0)
    }

    // Get effective speeds based on connection settings
    const effectiveDownloadSpeed = getEffectiveSpeed(downloadSpeed)
    const effectiveUploadSpeed = getEffectiveSpeed(uploadSpeed)

    // Calculate transfer times
    const downloadTimeValue = calculateTimeWithLatency(effectiveSizeBytes, effectiveDownloadSpeed)
    const uploadTimeValue = calculateTimeWithLatency(effectiveSizeBytes, effectiveUploadSpeed)
    const cloudUploadTimeValue = cloudProvider !== "none" ? estimateCloudUploadTime(effectiveSizeBytes) : 0

    setDownloadTime(downloadTimeValue)
    setUploadTime(uploadTimeValue)
    setCloudUploadTime(cloudUploadTimeValue)

    // Generate calculation details for transparency
    const { size: readableSize, unit: readableUnit } = convertFromBytes(totalSizeBytes)
    const { size: compressedReadableSize, unit: compressedReadableUnit } = convertFromBytes(effectiveSizeBytes)

    let details = `File size: ${readableSize.toFixed(2)} ${readableUnit} (${totalSizeBytes.toLocaleString()} bytes)\n`

    if (compressionEnabled) {
      details += `Compressed size: ${compressedReadableSize.toFixed(2)} ${compressedReadableUnit} (${effectiveSizeBytes.toLocaleString()} bytes)\n`
      details += `Compression ratio: ${compressionRate}%\n`
    }

    details += `\nEffective download speed: ${effectiveDownloadSpeed.toFixed(2)} Mbps\n`
    details += `Effective upload speed: ${effectiveUploadSpeed.toFixed(2)} Mbps\n`

    if (isVpnEnabled) {
      details += `VPN overhead applied: 20% reduction\n`
    }

    if (connectionType !== "wifi") {
      details += `${connectionType.charAt(0).toUpperCase() + connectionType.slice(1)} factor: ${mediumFactors[connectionType]}x\n`
    }

    details += `\nNetwork latency: ${networkLatency} ms\n`
    details += `Transfer type: ${transferType}\n`

    if (cloudProvider !== "none") {
      details += `Cloud provider: ${cloudProvider} (speed factor: ${cloudSpeedFactors[cloudProvider]}x)\n`
    }

    setCalculationDetails(details)
  }

  // Get appropriate icon for file type
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <Image className="h-4 w-4" />
    if (fileType.startsWith("video/")) return <Video className="h-4 w-4" />
    if (fileType.startsWith("text/")) return <FileText className="h-4 w-4" />
    if (fileType.includes("compressed") || fileType.includes("zip")) return <Archive className="h-4 w-4" />
    return <File className="h-4 w-4" />
  }

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (seconds < 0.01) {
      return "< 0.01 seconds"
    } else if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)} milliseconds`
    } else if (seconds < 60) {
      return `${seconds.toFixed(2)} seconds`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes} min ${remainingSeconds.toFixed(0)} sec`
    } else if (seconds < 86400) {
      // Less than a day
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours} hr ${minutes} min`
    } else {
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      return `${days} days ${hours} hr`
    }
  }

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    const { size, unit } = convertFromBytes(bytes)
    return `${size.toFixed(2)} ${unit}`
  }

  // Prepare chart data
  const chartData = [
    { name: "Download", time: downloadTime, label: formatTime(downloadTime) },
    { name: "Upload", time: uploadTime, label: formatTime(uploadTime) },
  ]

  if (cloudProvider !== "none") {
    chartData.push({
      name: `${cloudProvider.charAt(0).toUpperCase() + cloudProvider.slice(1)} Upload`,
      time: cloudUploadTime,
      label: formatTime(cloudUploadTime),
    })
  }

  // Comparison data for compressed vs uncompressed
  const comparisonData =
    compressionEnabled && compressedSize > 0
      ? [
          { name: "Uncompressed", size: uncompressedSize, sizeLabel: formatBytes(uncompressedSize) },
          { name: "Compressed", size: compressedSize, sizeLabel: formatBytes(compressedSize) },
        ]
      : []

  return (
    <div className="min-h-screen bg-[#110e24]">
      <div className="w-full max-w-4xl mx-auto mt-1 p-6 bg-[#1c1549]/40 backdrop-blur-md shadow-lg rounded-lg border border-[#1c1549]/80">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[#00cada]">Advanced File Transfer Estimator</h1>
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center ${
              isDragging ? "border-[#00cada] bg-[#1c1549]" : "border-[#1c1549]"
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="fileUpload"
              multiple
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[#1c1549] border border-[#1c1549]/70 rounded-md shadow-sm text-sm font-medium text-[#00cada] hover:bg-[#1c1549]/80"
            >
              Choose Files
            </button>
            <p className="mt-2 text-sm text-white/70">or drag and drop files here</p>
          </div>

          {files.length > 0 ? (
            <div>
              <h3 className="font-semibold mb-2 text-[#00cada]">Selected Files:</h3>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center text-white">
                    {getFileIcon(file.type)}
                    <span className="ml-2">
                      {file.name} - {convertFromBytes(file.size).size.toFixed(2)} {convertFromBytes(file.size).unit}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-white/70">
                Total size: {formatBytes(files.reduce((sum, file) => sum + convertToBytes(file.size, file.unit), 0))}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fileSize" className="block text-sm font-medium text-[#00cada]">
                  File Size
                </label>
                <input
                  id="fileSize"
                  type="number"
                  value={manualFileSize}
                  onChange={(e) => setManualFileSize(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="fileUnit" className="block text-sm font-medium text-[#00cada]">
                  Unit
                </label>
                <select
                  id="fileUnit"
                  value={manualFileUnit}
                  onChange={(e) => setManualFileUnit(e.target.value as FileUnit)}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                >
                  {units.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="bg-[#1c1549] p-2 rounded-md">
              <div className="flex space-x-2 flex-wrap gap-2">
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "wifi"
                      ? "bg-[#00cada] text-[#110e24]"
                      : "bg-[#1c1549] text-[#00cada] border border-[#00cada]/30 hover:border-[#00cada]/50"
                  }`}
                  onClick={() => setConnectionType("wifi")}
                >
                  <Wifi className="mr-2 h-4 w-4 inline" /> Wi-Fi
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "ethernet"
                      ? "bg-[#00cada] text-[#110e24]"
                      : "bg-[#1c1549] text-[#00cada] border border-[#00cada]/30 hover:border-[#00cada]/50"
                  }`}
                  onClick={() => setConnectionType("ethernet")}
                >
                  <Ethernet className="mr-2 h-4 w-4 inline" /> Ethernet
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "bluetooth"
                      ? "bg-[#00cada] text-[#110e24]"
                      : "bg-[#1c1549] text-[#00cada] border border-[#00cada]/30 hover:border-[#00cada]/50"
                  }`}
                  onClick={() => setConnectionType("bluetooth")}
                >
                  Bluetooth
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "4g"
                      ? "bg-[#00cada] text-[#110e24]"
                      : "bg-[#1c1549] text-[#00cada] border border-[#00cada]/30 hover:border-[#00cada]/50"
                  }`}
                  onClick={() => setConnectionType("4g")}
                >
                  4G
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "5g"
                      ? "bg-[#00cada] text-[#110e24]"
                      : "bg-[#1c1549] text-[#00cada] border border-[#00cada]/30 hover:border-[#00cada]/50"
                  }`}
                  onClick={() => setConnectionType("5g")}
                >
                  5G
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="downloadSpeed" className="block text-sm font-medium text-[#00cada]">
                  Download Speed (Mbps)
                </label>
                <input
                  id="downloadSpeed"
                  type="number"
                  value={downloadSpeed}
                  onChange={(e) => setDownloadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="uploadSpeed" className="block text-sm font-medium text-[#00cada]">
                  Upload Speed (Mbps)
                </label>
                <input
                  id="uploadSpeed"
                  type="number"
                  value={uploadSpeed}
                  onChange={(e) => setUploadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="networkLatency" className="block text-sm font-medium text-[#00cada]">
                  Network Latency (ms)
                </label>
                <input
                  id="networkLatency"
                  type="number"
                  value={networkLatency}
                  onChange={(e) => setNetworkLatency(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#00cada]">Current Bandwidth (Mbps)</label>
                <p className="mt-1 text-[#00cada]">{currentBandwidth.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="vpnEnabled"
                checked={isVpnEnabled}
                onChange={(e) => setIsVpnEnabled(e.target.checked)}
                className="h-4 w-4 text-[#00cada] focus:ring-[#00cada] border-[#1c1549]/70 rounded"
              />
              <label htmlFor="vpnEnabled" className="text-sm font-medium text-[#00cada]">
                VPN Enabled (reduces speed by 20%)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="compressionEnabled"
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="h-4 w-4 text-[#00cada] focus:ring-[#00cada] border-[#1c1549]/70 rounded"
              />
              <label htmlFor="compressionEnabled" className="text-sm font-medium text-[#00cada]">
                Enable Compression
              </label>
            </div>

            {compressionEnabled && (
              <div>
                <label htmlFor="compressionRate" className="block text-sm font-medium text-[#00cada]">
                  Compression Rate (%)
                </label>
                <input
                  id="compressionRate"
                  type="number"
                  min="0"
                  max="95"
                  value={compressionRate}
                  onChange={(e) => setCompressionRate(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
                />
                <p className="mt-1 text-xs text-white/70">
                  Note: Compression effectiveness varies by file type. Text files compress better than media files.
                </p>
              </div>
            )}

            <div className="bg-[#1c1549] p-2 rounded-md">
              <div className="flex space-x-2">
                <button
                  className={`px-4 py-2 rounded-md ${
                    transferType === "direct" ? "bg-[#00cada] text-[#110e24]" : "bg-[#1c1549] text-[#00cada]"
                  }`}
                  onClick={() => setTransferType("direct")}
                >
                  <ArrowRight className="mr-2 h-4 w-4 inline" /> Direct
                </button>
                <button
                  className={`px-4 py-2 rounded-md ${
                    transferType === "p2p" ? "bg-[#00cada] text-[#110e24]" : "bg-[#1c1549] text-[#00cada]"
                  }`}
                  onClick={() => setTransferType("p2p")}
                >
                  <PeerToPeer className="mr-2 h-4 w-4 inline" /> P2P
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="cloudProvider" className="block text-sm font-medium text-[#00cada]">
                Cloud Storage Provider
              </label>
              <select
                id="cloudProvider"
                value={cloudProvider}
                onChange={(e) => setCloudProvider(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-[#1c1549]/80 border border-[#1c1549]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#00cada] focus:border-[#00cada] text-white font-mono"
              >
                <option value="none">None</option>
                <option value="google-drive">Google Drive</option>
                <option value="aws-s3">AWS S3</option>
                <option value="onedrive">OneDrive</option>
                <option value="dropbox">Dropbox</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleEstimate}
            className="w-full px-4 py-2 bg-gradient-to-r from-[#00cada] to-[#00b5a0] hover:from-[#00b5a0] hover:to-[#009e8c] text-[#110e24] rounded-md shadow-sm font-medium transition-all duration-200"
          >
            Estimate Transfer Time
          </button>

          {downloadTime > 0 && (
            <div className="w-full space-y-4">
              {/* Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md">
                  <h3 className="text-[#00cada] font-semibold">Estimated Download Time</h3>
                  <p className="text-[#00cada] text-xl font-bold">{formatTime(downloadTime)}</p>
                  <p className="text-white/70 text-sm">
                    At {getEffectiveSpeed(downloadSpeed).toFixed(2)} Mbps effective speed
                  </p>
                </div>

                <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md">
                  <h3 className="text-[#00cada] font-semibold">Estimated Upload Time</h3>
                  <p className="text-[#00cada] text-xl font-bold">{formatTime(uploadTime)}</p>
                  <p className="text-white/70 text-sm">
                    At {getEffectiveSpeed(uploadSpeed).toFixed(2)} Mbps effective speed
                  </p>
                </div>

                {cloudProvider !== "none" && (
                  <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md md:col-span-2">
                    <h3 className="text-[#00cada] font-semibold">
                      Estimated {cloudProvider.charAt(0).toUpperCase() + cloudProvider.slice(1)} Upload Time
                    </h3>
                    <p className="text-[#00cada] text-xl font-bold">{formatTime(cloudUploadTime)}</p>
                    <p className="text-white/70 text-sm">
                      With {cloudProvider} speed factor: {cloudSpeedFactors[cloudProvider]}x
                    </p>
                  </div>
                )}
              </div>

              {/* File size comparison if compression is enabled */}
              {compressionEnabled && compressedSize > 0 && (
                <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md">
                  <h3 className="text-[#00cada] font-semibold mb-2">File Size Comparison</h3>
                  <div className="h-16 mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1c1549" />
                        <XAxis dataKey="name" stroke="#00cada" />
                        <YAxis stroke="#00cada" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#110e24", border: "1px solid #1c1549", color: "#00cada" }}
                          formatter={(value: any) => [formatBytes(value), "Size"]}
                        />
                        <Bar dataKey="size" fill="#00cada" name="Size" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between text-sm text-white">
                    <div>
                      <span className="font-medium">Original:</span> {formatBytes(uncompressedSize)}
                    </div>
                    <div>
                      <span className="font-medium">Compressed:</span> {formatBytes(compressedSize)}
                    </div>
                    <div>
                      <span className="font-medium">Saved:</span> {formatBytes(uncompressedSize - compressedSize)} (
                      {compressionRate}%)
                    </div>
                  </div>
                </div>
              )}

              {/* Transfer time chart */}
              <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md">
                <h3 className="text-[#00cada] font-semibold mb-2">Transfer Time Comparison</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1549" />
                      <XAxis dataKey="name" stroke="#00cada" />
                      <YAxis stroke="#00cada" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#110e24", border: "1px solid #1c1549", color: "#00cada" }}
                        formatter={(value: any) => [formatTime(value), "Time"]}
                      />
                      <Legend wrapperStyle={{ color: "#00cada" }} />
                      <Line
                        type="monotone"
                        dataKey="time"
                        stroke="#00cada"
                        strokeWidth={2}
                        dot={{ r: 5, fill: "#00cada" }}
                        activeDot={{ r: 8, fill: "#00cada" }}
                        name="Time (seconds)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calculation details */}
              <div className="bg-[#1c1549]/80 border border-[#1c1549]/70 p-4 rounded-md shadow-md">
                <h3 className="text-[#00cada] font-semibold mb-2">Calculation Details</h3>
                <pre className="text-white/80 text-xs whitespace-pre-wrap font-mono scrollbar-thin overflow-auto max-h-48">
                  {calculationDetails}
                </pre>
                <div className="mt-4 text-sm text-white/70">
                  <p className="mb-1">
                    <strong>Formula used:</strong> Transfer Time = File Size (bits) / Transfer Speed (bits per second)
                  </p>
                  <p>Latency and other factors are applied as adjustments to this base calculation.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

