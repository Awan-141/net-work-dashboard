"use client"

import type React from "react"
import { useEffect, useState, useRef, useCallback } from "react"
import { Chart } from "chart.js/auto"
import { FaSync, FaRobot } from "react-icons/fa"
import {
  FileIcon,
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts"

type Result = {
  [key: string]: string | number
}

type HistoryEntry = {
  timestamp: string
  ping: number
  download: number
  upload: number
}

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

//  formula to do  calculating file transfer time in seconds
// File Size (bits) / Transfer Speed (bits per second)
const calculateTime = (fileSizeBytes: number, speedMbps: number): number => {
  // Convert file size from bytes to bits
  const fileSizeBits = fileSizeBytes * 8
  // Convert speed from Mbps to bps (1 Mbps = 1,000,000 bps)
  const speedBps = speedMbps * 1000000
  // Calculate time in seconds
  return fileSizeBits / speedBps
}

const FileTransferEstimator: React.FC = () => {
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
    return <FileIcon className="h-4 w-4" />
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

  


  return (
    <div className="min-h-screen bg-[#051440]">
      <div className="w-full max-w-4xl mx-auto mt-1 p-6 bg-[#0a2463]/40 backdrop-blur-md shadow-lg rounded-lg border border-[#0a2463]/80">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[#ffd700]">Advanced File Transfer Estimator</h1>
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center ${
              isDragging ? "border-[#ffd700] bg-[#0a2463]" : "border-[#0a2463]"
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
              className="px-4 py-2 bg-[#0a2463] border border-[#0a2463]/70 rounded-md shadow-sm text-sm font-medium text-[#ffd700] hover:bg-[#0a2463]/80"
            >
              Choose Files
            </button>
            <p className="mt-2 text-sm text-white/70">or drag and drop files here</p>
          </div>

          {files.length > 0 ? (
            <div>
              <h3 className="font-semibold mb-2 text-[#ffd700]">Selected Files:</h3>
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
                <label htmlFor="fileSize" className="block text-sm font-medium text-[#ffd700]">
                  File Size
                </label>
                <input
                  id="fileSize"
                  type="number"
                  value={manualFileSize}
                  onChange={(e) => setManualFileSize(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="fileUnit" className="block text-sm font-medium text-[#ffd700]">
                  Unit
                </label>
                <select
                  id="fileUnit"
                  value={manualFileUnit}
                  onChange={(e) => setManualFileUnit(e.target.value as FileUnit)}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
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
            <div className="bg-[#0a2463] p-2 rounded-md">
              <div className="flex space-x-2 flex-wrap gap-2">
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "wifi"
                      ? "bg-[#ffd700] text-[#051440]"
                      : "bg-[#0a2463] text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/50"
                  }`}
                  onClick={() => setConnectionType("wifi")}
                >
                  <Wifi className="mr-2 h-4 w-4 inline" /> Wi-Fi
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "ethernet"
                      ? "bg-[#ffd700] text-[#051440]"
                      : "bg-[#0a2463] text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/50"
                  }`}
                  onClick={() => setConnectionType("ethernet")}
                >
                  <Ethernet className="mr-2 h-4 w-4 inline" /> Ethernet
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "bluetooth"
                      ? "bg-[#ffd700] text-[#051440]"
                      : "bg-[#0a2463] text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/50"
                  }`}
                  onClick={() => setConnectionType("bluetooth")}
                >
                  Bluetooth
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "4g"
                      ? "bg-[#ffd700] text-[#051440]"
                      : "bg-[#0a2463] text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/50"
                  }`}
                  onClick={() => setConnectionType("4g")}
                >
                  4G
                </button>
                <button
                  className={`px-4 py-2 rounded-md transition-all duration-200 ${
                    connectionType === "5g"
                      ? "bg-[#ffd700] text-[#051440]"
                      : "bg-[#0a2463] text-[#ffd700] border border-[#ffd700]/30 hover:border-[#ffd700]/50"
                  }`}
                  onClick={() => setConnectionType("5g")}
                >
                  5G
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="downloadSpeed" className="block text-sm font-medium text-[#ffd700]">
                  Download Speed (Mbps)
                </label>
                <input
                  id="downloadSpeed"
                  type="number"
                  value={downloadSpeed}
                  onChange={(e) => setDownloadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="uploadSpeed" className="block text-sm font-medium text-[#ffd700]">
                  Upload Speed (Mbps)
                </label>
                <input
                  id="uploadSpeed"
                  type="number"
                  value={uploadSpeed}
                  onChange={(e) => setUploadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="networkLatency" className="block text-sm font-medium text-[#ffd700]">
                  Network Latency (ms)
                </label>
                <input
                  id="networkLatency"
                  type="number"
                  value={networkLatency}
                  onChange={(e) => setNetworkLatency(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#ffd700]">Current Bandwidth (Mbps)</label>
                <p className="mt-1 text-[#ffd700]">{currentBandwidth.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="vpnEnabled"
                checked={isVpnEnabled}
                onChange={(e) => setIsVpnEnabled(e.target.checked)}
                className="h-4 w-4 text-[#ffd700] focus:ring-[#ffd700] border-[#0a2463]/70 rounded"
              />
              <label htmlFor="vpnEnabled" className="text-sm font-medium text-[#ffd700]">
                VPN Enabled (reduces speed by 20%)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="compressionEnabled"
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="h-4 w-4 text-[#ffd700] focus:ring-[#ffd700] border-[#0a2463]/70 rounded"
              />
              <label htmlFor="compressionEnabled" className="text-sm font-medium text-[#ffd700]">
                Enable Compression
              </label>
            </div>

            {compressionEnabled && (
              <div>
                <label htmlFor="compressionRate" className="block text-sm font-medium text-[#ffd700]">
                  Compression Rate (%)
                </label>
                <input
                  id="compressionRate"
                  type="number"
                  min="0"
                  max="95"
                  value={compressionRate}
                  onChange={(e) => setCompressionRate(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
                />
                <p className="mt-1 text-xs text-white/70">
                  Note: Compression effectiveness varies by file type. Text files compress better than media files.
                </p>
              </div>
            )}

            <div className="bg-[#0a2463] p-2 rounded-md">
              <div className="flex space-x-2">
                <button
                  className={`px-4 py-2 rounded-md ${
                    transferType === "direct" ? "bg-[#ffd700] text-[#051440]" : "bg-[#0a2463] text-[#ffd700]"
                  }`}
                  onClick={() => setTransferType("direct")}
                >
                  <ArrowRight className="mr-2 h-4 w-4 inline" /> Direct
                </button>
              
              </div>
            </div>

            <div>
              <label htmlFor="cloudProvider" className="block text-sm font-medium text-[#ffd700]">
                Cloud Storage Provider
              </label>
              <select
                id="cloudProvider"
                value={cloudProvider}
                onChange={(e) => setCloudProvider(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-[#0a2463]/80 border border-[#0a2463]/70 rounded-md shadow-sm focus:outline-none focus:ring-[#ffd700] focus:border-[#ffd700] text-white font-mono"
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
            className="w-full px-4 py-2 bg-gradient-to-r from-[#ffd700] to-[#ffb627] hover:from-[#ffb627] hover:to-[#ffa500] text-[#051440] rounded-md shadow-sm font-medium transition-all duration-200"
          >
            Estimate Transfer Time
          </button>

          {downloadTime > 0 && (
            <div className="w-full space-y-4">
              {/* Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0a2463]/80 border border-[#0a2463]/70 p-4 rounded-md shadow-md">
                  <h3 className="text-[#ffd700] font-semibold">Estimated Download Time</h3>
                  <p className="text-[#ffd700] text-xl font-bold">{formatTime(downloadTime)}</p>
                  <p className="text-white/70 text-sm">
                    At {getEffectiveSpeed(downloadSpeed).toFixed(2)} Mbps effective speed
                  </p>
                </div>

                <div className="bg-[#0a2463]/80 border border-[#0a2463]/70 p-4 rounded-md shadow-md">
                  <h3 className="text-[#ffd700] font-semibold">Estimated Upload Time</h3>
                  <p className="text-[#ffd700] text-xl font-bold">{formatTime(uploadTime)}</p>
                  <p className="text-white/70 text-sm">
                    At {getEffectiveSpeed(uploadSpeed).toFixed(2)} Mbps effective speed
                  </p>
                </div>

                {cloudProvider !== "none" && (
                  <div className="bg-[#0a2463]/80 border border-[#0a2463]/70 p-4 rounded-md shadow-md md:col-span-2">
                    <h3 className="text-[#ffd700] font-semibold">
                      Estimated {cloudProvider.charAt(0).toUpperCase() + cloudProvider.slice(1)} Upload Time
                    </h3>
                    <p className="text-[#ffd700] text-xl font-bold">{formatTime(cloudUploadTime)}</p>
                    <p className="text-white/70 text-sm">
                      With {cloudProvider} speed factor: {cloudSpeedFactors[cloudProvider]}x
                    </p>
                  </div>
                )}
              </div>

              
              {/* Transfer time chart */}
              <div className="bg-[#0a2463]/80 border border-[#0a2463]/70 p-4 rounded-md shadow-md">
                <h3 className="text-[#ffd700] font-semibold mb-2">Transfer Time Comparison</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0a2463" />
                      <XAxis dataKey="name" stroke="#ffd700" />
                      <YAxis stroke="#ffd700" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#051440", border: "1px solid #0a2463", color: "#ffd700" }}
                        formatter={(value: any) => [formatTime(value), "Time"]}
                      />
                      <Legend wrapperStyle={{ color: "#ffd700" }} />
                      <Line
                        type="monotone"
                        dataKey="time"
                        stroke="#ffd700"
                        strokeWidth={2}
                        dot={{ r: 5, fill: "#ffd700" }}
                        activeDot={{ r: 8, fill: "#ffd700" }}
                        name="Time (seconds)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calculation details */}
              <div className="bg-[#0a2463]/80 border border-[#0a2463]/70 p-4 rounded-md shadow-md">
                <h3 className="text-[#ffd700] font-semibold mb-2">Calculation Details</h3>
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http:35.169.254.242:3001/"

const NetworkTestApp: React.FC = () => {
  const [results, setResults] = useState<Result>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [progress, setProgress] = useState<number>(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [chart, setChart] = useState<Chart | null>(null)
  const [isEstimatorOpen, setIsEstimatorOpen] = useState(false)

  const openEstimator = () => setIsEstimatorOpen(true)
  const closeEstimator = () => setIsEstimatorOpen(false)

  const fetchData = async () => {
    setLoading(true)
    setResults({
      ip: "Fetching...",
      ping: "Testing...",
      download: "Testing...",
      upload: "Testing...",
      nmap: "Scanning...",
      ports: "Scanning...",
      services: "Detecting...",
      vuln: "Scanning...",
      ssl: "Checking...",
      firewall: "Checking...",
    })

    const fetchTest = async (endpoint: string, key: string, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(API_URL + endpoint)
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
          const data = await response.json()
          setResults((prev) => ({ ...prev, [key]: data[key] || `Error: ${data.error}` }))
          return
        } catch (error) {
          if (i === retries - 1) {
            setResults((prev) => ({ ...prev, [key]: `Request failed: ${(error as Error).message}` }))
          }
        }
      }
    }

    await fetchTest("ip", "ip")
    const startTime = typeof window !== "undefined" ? Date.now() : 0
    await fetchTest("ping", "ping")
    setResults((prev) => ({ ...prev, ping: `${Date.now() - startTime}ms` }))

    const downloadStart = Date.now()
    const downloadResponse = await fetch(API_URL + "download")
    const reader = downloadResponse.body?.getReader()
    if (!reader) throw new Error("Failed to read download stream")
    let receivedLength = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      receivedLength += value.length
      setProgress((receivedLength / Number(downloadResponse.headers.get("content-length"))) * 100)
    }
    const blob = new Blob(chunks)
    const downloadSpeed = blob.size / ((Date.now() - downloadStart) / 1000) / 1024 / 1024
    setResults((prev) => ({ ...prev, download: `Download Speed: ${downloadSpeed.toFixed(2)} MB/s` }))

    let uploadSpeed = 0
    const formData = new FormData()
    formData.append("file", new File([blob], "downloaded_test_file", { type: blob.type }))

    try {
      const uploadStart = Date.now()

      const uploadResponse = await fetch(API_URL + "upload", {
        method: "POST",
        body: formData,
        headers: {
          "x-start-time": uploadStart.toString(),
        },
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      const uploadData = await uploadResponse.json()

      const uploadTime = uploadData.uploadTime || Date.now() - uploadStart
      uploadSpeed = blob.size / (uploadTime / 1000) / 1024 / 1024

      setResults((prev) => ({ ...prev, upload: `Upload Speed: ${uploadSpeed.toFixed(2)} MB/s` }))
    } catch (error) {
      console.error("Upload error:", error)
      setResults((prev) => ({ ...prev, upload: `Upload failed: ${(error as Error).message}` }))
    }

    await Promise.all([
      fetchTest("nmap", "nmap"),
      fetchTest("open-ports", "ports"),
      fetchTest("services", "services"),
      fetchTest("vuln-scan", "vuln"),
      fetchTest("ssl-check", "ssl"),
      fetchTest("firewall-check", "firewall"),
    ])

    setHistory((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString("en-US"),
        ping: Number.parseFloat(results.ping as string),
        download: Number.parseFloat(downloadSpeed.toFixed(2)),
        upload: Number.parseFloat(uploadSpeed.toFixed(2)),
      },
    ])

    setLoading(false)
  }

  useEffect(() => {
    if (typeof window !== "undefined" && history.length > 0) {
      const ctx = document.getElementById("historyChart") as HTMLCanvasElement | null
      if (!ctx) return

      if (chart) chart.destroy()

      const newChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: history.map((entry) => entry.timestamp),
          datasets: [
            {
              label: "Ping (ms)",
              data: history.map((entry) => entry.ping),
              borderColor: "rgba(255, 215, 0, 1)",
              fill: false,
            },
            {
              label: "Download Speed (MB/s)",
              data: history.map((entry) => entry.download),
              borderColor: "rgba(255, 182, 39, 1)",
              fill: false,
            },
            {
              label: "Upload Speed (MB/s)",
              data: history.map((entry) => entry.upload),
              borderColor: "rgba(10, 36, 99, 1)",
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: "#ffffff",
              },
            },
            x: {
              ticks: {
                color: "#ffffff",
              },
            },
          },
          plugins: {
            legend: {
              labels: {
                color: "#ffffff",
              },
            },
          },
        },
      })

      setChart(newChart)
    }
  }, [history])

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-[#051440] text-white p-8 flex flex-col items-center">
      <button
        className="fixed bottom-8 right-8 bg-[#ffd700] text-[#051440] p-4 rounded-full shadow-lg hover:bg-[#ffb627] transition-colors"
        aria-label="Chatbot"
      >
        <FaRobot className="text-2xl" />
      </button>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6 col-span-3">
          <h1 className="text-3xl font-bold text-[#ffd700]">Network Traffic Dashboard</h1>
          <div className="flex flex-row mt-3 ">
            <button
              onClick={fetchData}
              className="flex items-center bg-[#ffd700] text-[#051440] px-4 py-2 rounded-lg hover:bg-[#ffb627] transition-colors"
            >
              <FaSync className={`mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">IP Address</h2>
          <p className="text-white mt-1 text-7xl flex justify-center items-center w-full">
            {results?.ip ? results.ip.toString().replace(/^::ffff:/, "") : "N/A"}
          </p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Ping</h2>
          <p className="text-white mt-1">{results.ping}</p>
          <div className="w-full h-2 bg-[#051440] rounded-lg mt-2 overflow-hidden">
            <div
              className="h-2 rounded-lg"
              style={{
                width: `${Math.min(100, Number.parseFloat(results.ping as string) / 5)}%`,
                backgroundColor: `rgb(${Math.min(255, (Number.parseFloat(results.ping as string) / 2) * 5)}, ${Math.min(215, (Number.parseFloat(results.ping as string) / 2) * 5)}, 0)`,
              }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-gray-400 mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Network Speed</h2>
          <div className="flex justify-between">
            <p className="text-white mt-1">{results.download}</p>
            <p className="text-white mt-1">{results.upload}</p>
          </div>
          <div className="w-full h-2 bg-[#051440] rounded-lg mt-2 overflow-hidden">
            <div
              className="h-2 bg-[#ffd700] rounded-lg"
              style={{
                width: `${progress}%`,
              }}
            ></div>
          </div>
          <button
            onClick={openEstimator}
            className="mt-4 px-4 py-2 bg-[#ffd700] text-[#051440] rounded-lg hover:bg-[#ffb627]"
          >
            Advanced File Speed Calculator
          </button>
          {isEstimatorOpen && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <div className="bg-[#0a2463] rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <button
                  onClick={closeEstimator}
                  className="mt-4 px-4 py-2 bg-[#ffd700] text-[#051440] rounded-lg hover:bg-[#ffb627] mx-5"
                >
                  Close
                </button>
                <FileTransferEstimator />
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Nmap Scan</h2>
          <p className="text-white mt-1">{results.nmap}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Open Ports</h2>
          <p className="text-white mt-1">{results.ports}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Services</h2>
          <p className="text-white mt-1">{results.services}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Vulnerability Scan</h2>
          <p className="text-white mt-1">{results.vuln}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">SSL Check</h2>
          <p className="text-white mt-1">{results.ssl}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#ffd700]">Firewall Check</h2>
          <p className="text-white mt-1">{results.firewall}</p>
        </div>

        <div className="bg-[#0a2463] shadow-lg rounded-2xl p-6 col-span-3">
          <h2 className="text-xl font-semibold text-[#ffd700]">Historical Performance</h2>
          <canvas id="historyChart"></canvas>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return <NetworkTestApp />
}

