"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";
import { FaSync, FaRobot } from "react-icons/fa";
import {
  File as FileIcon,
  Image,
  Video,
  FileText,
  Archive,
  Wifi,
  NetworkIcon as Ethernet,
  NetworkIcon as PeerToPeer,
  ArrowRight,
} from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

type Result = {
  [key: string]: string | number;
};

type HistoryEntry = {
  timestamp: string;
  ping: number;
  download: number;
  upload: number;
};


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

const calculateTime = (size: number, speed: number): number => (size * 8) / (speed * 1024 * 1024)

const FileTransferEstimator: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([])
  const [downloadSpeed, setDownloadSpeed] = useState<number>(1)
  const [uploadSpeed, setUploadSpeed] = useState<number>(2)
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(false)
  const [compressionRate, setCompressionRate] = useState<number>(50)
  const [downloadTime, setDownloadTime] = useState<number>(0)
  const [uploadTime, setUploadTime] = useState<number>(0)
  const [networkLatency, setNetworkLatency] = useState<number>(50)
  const [currentBandwidth, setCurrentBandwidth] = useState<number>(0)
  const [cloudProvider, setCloudProvider] = useState<string>("none")
  const [cloudUploadTime, setCloudUploadTime] = useState<number>(0)
  const [isVpnEnabled, setIsVpnEnabled] = useState<boolean>(false)
  const [connectionType, setConnectionType] = useState<"wifi" | "ethernet">("wifi")
  const [transferType, setTransferType] = useState<"direct" | "p2p">("direct")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)

  const simulateBandwidthMonitoring = useCallback(() => {
    const baseBandwidth = (downloadSpeed + uploadSpeed) / 2
    const fluctuation = Math.random() * 0.2 - 0.1 // -10% to +10% fluctuation
    setCurrentBandwidth(baseBandwidth * (1 + fluctuation))
  }, [downloadSpeed, uploadSpeed])

  useEffect(() => {
    const intervalId = setInterval(simulateBandwidthMonitoring, 5000) // Update every 5 seconds
    return () => clearInterval(intervalId)
  }, [simulateBandwidthMonitoring])

  const calculateTimeWithLatency = (size: number, speed: number): number => {
    const baseTime = calculateTime(size, speed)
    return baseTime + networkLatency / 1000 // Convert latency from ms to seconds
  }

  const estimateCloudUploadTime = (size: number): number => {
    const cloudSpeedFactors: Record<string, number> = {
      none: 1,
      "google-drive": 0.9,
      "aws-s3": 1.1,
      onedrive: 0.95,
    }
    const effectiveSpeed = uploadSpeed * cloudSpeedFactors[cloudProvider]
    return calculateTimeWithLatency(size, effectiveSpeed)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const fileData = selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      unit: "bytes" as FileUnit,
      type: file.type,
    }))
    setFiles(fileData)
  }

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
  }

  const handleEstimate = () => {
    let totalSizeBytes = files.reduce((sum, file) => sum + convertToBytes(file.size, file.unit), 0)

    if (compressionEnabled) {
      totalSizeBytes *= 1 - compressionRate / 100
    }

    const { size: finalSize } = convertFromBytes(totalSizeBytes)

    let effectiveDownloadSpeed = downloadSpeed
    let effectiveUploadSpeed = uploadSpeed

    if (isVpnEnabled) {
      effectiveDownloadSpeed *= 0.9
      effectiveUploadSpeed *= 0.9
    }

    if (connectionType === "ethernet") {
      effectiveDownloadSpeed *= 1.2
      effectiveUploadSpeed *= 1.2
    }

    if (transferType === "p2p") {
      effectiveDownloadSpeed *= 0.8
      effectiveUploadSpeed *= 0.8
    }

    const downloadTimeValue = calculateTimeWithLatency(finalSize, effectiveDownloadSpeed)
    const uploadTimeValue = calculateTimeWithLatency(finalSize, effectiveUploadSpeed)
    const cloudUploadTimeValue = estimateCloudUploadTime(finalSize)

    setDownloadTime(downloadTimeValue)
    setUploadTime(uploadTimeValue)
    setCloudUploadTime(cloudUploadTimeValue)
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <Image className="h-4 w-4" />
    if (fileType.startsWith("video/")) return <Video className="h-4 w-4" />
    if (fileType.startsWith("text/")) return <FileText className="h-4 w-4" />
    if (fileType.includes("compressed") || fileType.includes("zip")) return <Archive className="h-4 w-4" />
    return <FileIcon className="h-4 w-4" />
  }

  const chartData = [
    { name: "Download", time: downloadTime },
    { name: "Upload", time: uploadTime },
    { name: "Cloud Upload", time: cloudUploadTime },
  ]

  return (
    <div className="min-h-[300px] bg-[#110e24]">
      <div className="w-full max-w-4xl mx-auto mt-1 p-6 bg-[#1c1549] shadow-lg rounded-lg">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Advanced FileIcon Transfer Estimator</h1>
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center ${isDragging ? "border-[#00cada] bg-[#69639c]" : "border-gray-600"}`}
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
              className="px-4 py-2 bg-[#1c1549] border border-gray-500 rounded-md shadow-sm text-sm font-medium text-white hover:bg-[#69639c]"
            >
              Choose Files
            </button>
            <p className="mt-2 text-sm text-gray-400">or drag and drop files here</p>
          </div>
          {files.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-white">Selected Files:</h3>
              <ul className="space-y-1">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center text-gray-300">
                    {getFileIcon(file.type)}
                    <span className="ml-2">
                      {file.name} - {convertFromBytes(file.size).size.toFixed(2)} {convertFromBytes(file.size).unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-4">
            <div className="bg-[#69639c] p-2 rounded-md">
              <div className="flex space-x-2">
                <button
                  className={`px-4 py-2 rounded-md ${connectionType === "wifi" ? "bg-[#00cada] text-white" : "bg-[#1c1549] text-white"}`}
                  onClick={() => setConnectionType("wifi")}
                >
                  <Wifi className="mr-2 h-4 w-4 inline text-white" /> Wi-Fi
                </button>
                <button
                  className={`px-4 py-2 rounded-md ${connectionType === "ethernet" ? "bg-[#00cada] text-white" : "bg-[#1c1549] text-white"}`}
                  onClick={() => setConnectionType("ethernet")}
                >
                  <Ethernet className="mr-2 h-4 w-4 inline text-white" /> Ethernet
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="downloadSpeed" className="block text-sm font-medium text-white">
                  Download Speed (Mbps)
                </label>
                <input
                  id="downloadSpeed"
                  type="number"
                  value={downloadSpeed}
                  onChange={(e) => setDownloadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-[#1c1549] text-white focus:outline-none focus:ring-[#00cada] focus:border-[#00cada]"
                />
              </div>
              <div>
                <label htmlFor="uploadSpeed" className="block text-sm font-medium text-white">
                  Upload Speed (Mbps)
                </label>
                <input
                  id="uploadSpeed"
                  type="number"
                  value={uploadSpeed}
                  onChange={(e) => setUploadSpeed(Number(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-[#1c1549] text-white focus:outline-none focus:ring-[#00cada] focus:border-[#00cada]"
                />
              </div>
            </div>
            <button
              onClick={handleEstimate}
              className="w-full px-4 py-2 bg-[#00cada] hover:bg-[#00b5a0] text-white rounded-md shadow-sm"
            >
              Estimate Transfer Time
            </button>
          </div>
        </div>
      </div>
    </div>

  );
};


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://backend.themsovietbois.com:3001/";

const NetworkTestApp: React.FC = () => {
  const [results, setResults] = useState<Result>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [chart, setChart] = useState<Chart | null>(null);
  const [isEstimatorOpen, setIsEstimatorOpen] = useState(false);

  const openEstimator = () => setIsEstimatorOpen(true);
  const closeEstimator = () => setIsEstimatorOpen(false);

  const fetchData = async () => {
    setLoading(true);
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
    });

    const fetchTest = async (endpoint: string, key: string, retries: number = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(API_URL + endpoint);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();
          setResults((prev) => ({ ...prev, [key]: data[key] || `Error: ${data.error}` }));
          return;
        } catch (error) {
          if (i === retries - 1) {
            setResults((prev) => ({ ...prev, [key]: `Request failed: ${(error as Error).message}` }));
          }
        }
      }
    };

    await fetchTest("ip", "ip");
    const startTime = typeof window !== "undefined" ? Date.now() : 0;
    await fetchTest("ping", "ping");
    setResults((prev) => ({ ...prev, ping: `${Date.now() - startTime}ms` }));

    const downloadStart = Date.now();
    const downloadResponse = await fetch(API_URL + "download");
    const reader = downloadResponse.body?.getReader();
    if (!reader) throw new Error("Failed to read download stream");
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
      setProgress((receivedLength / Number(downloadResponse.headers.get("content-length"))) * 100);
    }
    const blob = new Blob(chunks);
    const downloadSpeed = (blob.size / ((Date.now() - downloadStart) / 1000)) / 1024 / 1024;
    setResults((prev) => ({ ...prev, download: `Download Speed: ${downloadSpeed.toFixed(2)} MB/s` }));

    let uploadSpeed = 0;
    const formData = new FormData();
    formData.append("file", new File([blob], "downloaded_test_file", { type: blob.type }));

    try {
      const uploadStart = Date.now();

      const uploadResponse = await fetch(API_URL + "upload", {
        method: "POST",
        body: formData,
        headers: {
          "x-start-time": uploadStart.toString(),
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();

      const uploadTime = uploadData.uploadTime || Date.now() - uploadStart;
      uploadSpeed = (blob.size / (uploadTime / 1000)) / 1024 / 1024;

      setResults((prev) => ({ ...prev, upload: `Upload Speed: ${uploadSpeed.toFixed(2)} MB/s` }));
    } catch (error) {
      console.error("Upload error:", error);
      setResults((prev) => ({ ...prev, upload: `Upload failed: ${(error as Error).message}` }));
    }

    await Promise.all([
      fetchTest("nmap", "nmap"),
      fetchTest("open-ports", "ports"),
      fetchTest("services", "services"),
      fetchTest("vuln-scan", "vuln"),
      fetchTest("ssl-check", "ssl"),
      fetchTest("firewall-check", "firewall"),
    ]);

    setHistory((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString("en-US"),
        ping: parseFloat(results.ping as string),
        download: parseFloat(downloadSpeed.toFixed(2)),
        upload: parseFloat(uploadSpeed.toFixed(2)),
      },
    ]);

    setLoading(false);
  };


  useEffect(() => {
    if (typeof window !== "undefined" && history.length > 0) {
      const ctx = document.getElementById("historyChart") as HTMLCanvasElement | null;
      if (!ctx) return;

      if (chart) chart.destroy();

      const newChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: history.map((entry) => entry.timestamp),
          datasets: [
            {
              label: "Ping (ms)",
              data: history.map((entry) => entry.ping),
              borderColor: "rgba(255, 99, 132, 1)",
              fill: false,
            },
            {
              label: "Download Speed (MB/s)",
              data: history.map((entry) => entry.download),
              borderColor: "rgba(54, 162, 235, 1)",
              fill: false,
            },
            {
              label: "Upload Speed (MB/s)",
              data: history.map((entry) => entry.upload),
              borderColor: "rgba(75, 192, 192, 1)",
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
      });


      setChart(newChart);
    }
  }, [history]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-[#110e24] text-white p-8 flex flex-col items-center">
      <button
        className="fixed bottom-8 right-8 bg-[#00cada] text-white p-4 rounded-full shadow-lg hover:bg-[#0099a8] transition-colors"
        aria-label="Chatbot"
      >
        <FaRobot className="text-2xl text-white" />
      </button>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6 col-span-3">
          <h1 className="text-3xl font-bold text-white">Network Traffic Dashboard</h1>
          <div className="flex flex-row mt-3 ">
            <button
              onClick={fetchData}
              className="flex items-center bg-[#00cada] text-white px-4 py-2 rounded-lg hover:bg-[#0099a8] transition-colors"
            >
              <FaSync className={`mr-2 text-white ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">IP Address</h2>
          <p className="text-white mt-1 text-7xl flex justify-center items-center w-full">
            {results?.ip ? results.ip.toString().replace(/^::ffff:/, '') : 'N/A'}
          </p>
        </div>


        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Ping</h2>
          <p className="text-white mt-1">{results.ping}</p>
          <div className="w-full h-2 bg-[#69639c] rounded-lg mt-2 overflow-hidden">
            <div
              className="h-2 rounded-lg"
              style={{
                width: `${Math.min(100, parseFloat(results.ping as string) / 5)}%`,
                backgroundColor: `rgb(${Math.min(255, (parseFloat(results.ping as string) / 2) * 5)}, 0, ${Math.max(
                  0,
                  255 - (parseFloat(results.ping as string) / 2) * 5
                )})`,
              }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-gray-400 mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Network Speed</h2>
          <div className="flex justify-between">
            <p className="text-white mt-1">{results.download}</p>
            <p className="text-white mt-1">{results.upload}</p>
          </div>
          <progress value={progress} max="100" className="w-full mt-2"></progress>
          <button
            onClick={openEstimator}
            className="mt-4 px-4 py-2 bg-[#00cada] text-white rounded-lg hover:bg-[#0099a8]"
          >
            Advanced File Speed Calculator
          </button>
          {isEstimatorOpen && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <div className="bg-[#1c1549] rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <button
                  onClick={closeEstimator}
                  className="mt-4 px-4 py-2 bg-[#00cada] text-white rounded-lg hover:bg-[#0099a8] mx-5"
                >
                  Close
                </button>
                <FileTransferEstimator />
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Nmap Scan</h2>
          <p className="text-white mt-1">{results.nmap}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Open Ports</h2>
          <p className="text-white mt-1">{results.ports}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Services</h2>
          <p className="text-white mt-1">{results.services}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Vulnerability Scan</h2>
          <p className="text-white mt-1">{results.vuln}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">SSL Check</h2>
          <p className="text-white mt-1">{results.ssl}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-[#00cada]">Firewall Check</h2>
          <p className="text-white mt-1">{results.firewall}</p>
        </div>

        <div className="bg-[#1c1549] shadow-lg rounded-2xl p-6 col-span-3">
          <h2 className="text-xl font-semibold text-[#00cada]">Historical Performance</h2>
          <canvas id="historyChart"></canvas>
        </div>
      </div>
    </div>
  );
};

export default NetworkTestApp;