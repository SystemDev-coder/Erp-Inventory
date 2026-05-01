import { Mic, Paperclip, Phone, Send, Video, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settings.service';

const SUPPORT_NUMBER = '612374744';
const WHATSAPP_E164 = `252${SUPPORT_NUMBER}`;

type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file';

type ChatMessage = {
  id: string;
  type: MessageType;
  text?: string;
  url?: string;
  fileName?: string;
  createdAt: string;
  from: 'me' | 'company';
};

const Support = () => {
  const { user } = useAuth();
  const branchName = user?.branch_name || 'Main Branch';
  const senderName = user?.name || 'Customer';
  const senderUser = user?.username ? ` (${user.username})` : '';
  const [companyPhone, setCompanyPhone] = useState<string>('');

  const [message, setMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const composedHeader = useMemo(() => {
    const phoneLabel = companyPhone ? ` • Customer Phone: ${companyPhone}` : ' • Customer Phone: -';
    return `Company/Branch: ${branchName} • User: ${senderName}${senderUser}${phoneLabel}`;
  }, [branchName, senderName, senderUser, companyPhone]);

  useEffect(() => {
    const loadCompany = async () => {
      const res = await settingsService.getCompany();
      if (res.success && res.data?.company?.phone) {
        setCompanyPhone(res.data.company.phone);
      }
    };
    loadCompany();
  }, []);

  const addMessage = (entry: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      },
    ]);
  };

  const handleAttach = (files: FileList | null) => {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const persistLocalMessage = () => {
    const trimmed = message.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    if (trimmed) {
      addMessage({ type: 'text', text: trimmed, from: 'me' });
    }

    pendingFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      const fileType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'file';
      addMessage({ type: fileType, url, fileName: file.name, from: 'me' });
    });

    setMessage('');
    setPendingFiles([]);
  };

  const handleSendWhatsApp = () => {
    const textForWhatsapp = message.trim();
    persistLocalMessage();
    const base = `Support Chat\n${composedHeader}\n---\n${textForWhatsapp || '[No message]'}`;
    const url = `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(base)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRecord = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        addMessage({ type: 'audio', url, fileName: 'voice-note.webm', from: 'me' });
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Mic permission denied', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">WhatsApp Support</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">{composedHeader}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-semibold text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
            <Phone className="h-4 w-4" />
            Support: {SUPPORT_NUMBER}
          </span>
          {companyPhone && (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              Customer: {companyPhone}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          <aside className="border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="p-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">Support Chat</p>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <MessageCircle className="h-4 w-4 text-primary-600" />
                  {branchName} Customer Care
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sending to: {SUPPORT_NUMBER}</p>
                {companyPhone && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Customer: {companyPhone}</p>
                )}
              </div>
            </div>
          </aside>

          <section className="flex flex-col min-h-[520px]">
            <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-3 text-xs text-slate-600 dark:text-slate-300">
              Sending to <span className="font-semibold text-slate-900 dark:text-slate-100">{SUPPORT_NUMBER}</span> • Customer phone{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{companyPhone || '-'}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
              {messages.length === 0 && (
                <div className="text-center text-sm text-slate-500 dark:text-slate-300">
                  Start a conversation. Your messages are saved locally in this session.
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      msg.from === 'me'
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-slate-800 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800'
                    }`}
                  >
                    {msg.type === 'text' && <p>{msg.text}</p>}
                    {msg.type === 'image' && msg.url && (
                      <div className="space-y-2">
                        <img src={msg.url} alt={msg.fileName} className="rounded-xl max-h-64" />
                        <p className="text-xs opacity-80">{msg.fileName}</p>
                      </div>
                    )}
                    {msg.type === 'video' && msg.url && (
                      <div className="space-y-2">
                        <video controls className="rounded-xl max-h-64 w-full">
                          <source src={msg.url} />
                        </video>
                        <p className="text-xs opacity-80">{msg.fileName}</p>
                      </div>
                    )}
                    {msg.type === 'audio' && msg.url && (
                      <div className="space-y-2">
                        <audio controls className="w-full">
                          <source src={msg.url} />
                        </audio>
                        <p className="text-xs opacity-80">{msg.fileName}</p>
                      </div>
                    )}
                    {msg.type === 'file' && (
                      <div className="space-y-1">
                        <p className="font-semibold">{msg.fileName}</p>
                        <p className="text-xs opacity-80">File attached</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 p-4">
              {pendingFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingFiles.map((file) => (
                    <span
                      key={file.name + file.size}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                    >
                      {file.type.startsWith('image/') && <ImageIcon className="h-3 w-3" />}
                      {file.type.startsWith('video/') && <Video className="h-3 w-3" />}
                      {file.type.startsWith('audio/') && <Mic className="h-3 w-3" />}
                      {file.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                <div className="flex items-center gap-2">
                <label className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/60 cursor-pointer">
                  <Paperclip className="h-4 w-4" />
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,audio/*"
                    onChange={(e) => handleAttach(e.target.files)}
                  />
                </label>

                <button
                  onClick={handleRecord}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${
                    isRecording
                      ? 'border-error-500 bg-error-500 text-white'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                </div>

                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendWhatsApp();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:flex-1"
                  placeholder="Type a message..."
                />

                <button
                  onClick={handleSendWhatsApp}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 sm:w-auto"
                >
                  <Send className="h-4 w-4" />
                  Send on WhatsApp
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Messages are sent to support number {SUPPORT_NUMBER}. Your company phone is {companyPhone || '-'}.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Support;
