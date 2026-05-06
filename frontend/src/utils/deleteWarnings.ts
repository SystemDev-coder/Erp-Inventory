export const isDeleteBlockedMessage = (message: string | undefined | null) => {
  const msg = String(message || '').trim();
  if (!msg) return false;
  return (
    msg.toLowerCase().startsWith('cannot delete:') ||
    msg.toLowerCase().includes('cannot be deleted') ||
    msg.toLowerCase().includes('already used in')
  );
};

export const deleteToastLevel = (message: string | undefined | null) =>
  isDeleteBlockedMessage(message) ? ('warning' as const) : ('error' as const);

