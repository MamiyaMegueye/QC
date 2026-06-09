import { useRef } from "react"
import { Upload, Check, FileText } from "lucide-react"

export default function UploadZone({
  label,
  hint,
  badge = "Optionnel",
  required = false,
  accept,
  file,
  onChange,
  iconColor = "gold",
}) {
  const inputRef = useRef(null)

  const formatSize = (bytes) => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const filled = !!file
  const baseClass = "border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer hover:border-navy/40"
  const styleClass = filled
    ? "border-green-500 bg-green-50 border-solid"
    : required
    ? "border-green-400 bg-green-50/40"
    : "border-gray-200 bg-gray-50/40"

  return (
    <div>
      <div
        className={`${baseClass} ${styleClass}`}
        onClick={() => inputRef.current?.click()}
      >
        <div
          className={`w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
            filled
              ? "bg-green-100 text-green-600"
              : iconColor === "green"
              ? "bg-green-100 text-green-600"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {filled ? (
            <Check className="w-7 h-7" />
          ) : (
            <Upload className="w-7 h-7" />
          )}
        </div>
        <p className="font-bold text-navy text-base m-0">{label}</p>
        <p className="text-gray-500 text-xs mt-1 m-0">{hint}</p>
        <span
          className={`badge mt-2 inline-block ${
            required ? "badge-required" : "badge-optional"
          }`}
        >
          {required ? "Requis" : badge}
        </span>
        {filled && (
          <>
            <div className="mt-3 text-sm text-navy font-medium flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              {file.name}
            </div>
            <div className="text-xs text-gray-500">{formatSize(file.size)}</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChange(f)
        }}
      />
    </div>
  )
}
