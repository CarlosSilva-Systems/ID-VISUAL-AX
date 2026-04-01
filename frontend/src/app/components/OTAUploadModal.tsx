import React, { useState } from 'react';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface OTAUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OTAUploadModal({ open, onClose, onSuccess }: OTAUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<{ file?: string; version?: string }>({});

  const validateVersion = (v: string): boolean => {
    return /^\d+\.\d+\.\d+$/.test(v);
  };

  const validateFile = (f: File): boolean => {
    if (!f.name.endsWith('.bin')) return false;
    if (f.size < 100 * 1024 || f.size > 2 * 1024 * 1024) return false;
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    
    // Clear file error when new file is selected
    if (selectedFile) {
      setErrors(prev => ({ ...prev, file: undefined }));
    }
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVersion(e.target.value);
    
    // Clear version error when user types
    if (e.target.value) {
      setErrors(prev => ({ ...prev, version: undefined }));
    }
  };

  const handleUpload = async () => {
    // Validation
    const newErrors: typeof errors = {};
    
    if (!file || !validateFile(file)) {
      newErrors.file = 'Arquivo .bin inválido (100KB - 2MB)';
    }
    
    if (!validateVersion(version)) {
      newErrors.version = 'Formato inválido (ex: 1.2.0)';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Upload
    setUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('version', version);

      await api.uploadFirmware(formData, (progress) => {
        setUploadProgress(progress);
      });

      toast.success(`Firmware ${version} enviado com sucesso`);
      onSuccess?.();
      handleClose();
    } catch (error: any) {
      toast.error('Erro ao enviar firmware: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setFile(null);
      setVersion('');
      setErrors({});
      setUploadProgress(0);
      onClose();
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Upload className="text-blue-600" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Upload Manual de Firmware</h3>
              <p className="text-xs text-slate-500">Envie um arquivo .bin personalizado</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Version Input */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Versão
            </label>
            <input
              type="text"
              value={version}
              onChange={handleVersionChange}
              placeholder="1.2.0"
              disabled={uploading}
              className={cn(
                "w-full p-4 rounded-xl border font-bold text-sm transition-all outline-none",
                errors.version
                  ? "border-red-300 bg-red-50 focus:ring-4 focus:ring-red-500/10 focus:border-red-600"
                  : "border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600"
              )}
            />
            {errors.version && (
              <div className="flex items-center gap-2 text-red-600 text-xs font-bold">
                <AlertCircle size={14} />
                {errors.version}
              </div>
            )}
          </div>

          {/* File Input */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Arquivo Firmware
            </label>
            <label
              className={cn(
                "w-full p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-3",
                uploading && "opacity-50 cursor-not-allowed",
                errors.file
                  ? "border-red-300 bg-red-50 hover:bg-red-100"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              )}
            >
              <input
                type="file"
                accept=".bin"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="text-blue-600" size={24} />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-700 text-sm">
                  {file ? file.name : 'Selecionar Arquivo .bin'}
                </p>
                {file && (
                  <p className="text-xs text-slate-500 mt-1">
                    {formatBytes(file.size)}
                  </p>
                )}
                {!file && (
                  <p className="text-xs text-slate-400 mt-1">
                    Tamanho: 100KB - 2MB
                  </p>
                )}
              </div>
            </label>
            {errors.file && (
              <div className="flex items-center gap-2 text-red-600 text-xs font-bold">
                <AlertCircle size={14} />
                {errors.file}
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !version}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {uploading ? 'Enviando...' : 'Fazer Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
