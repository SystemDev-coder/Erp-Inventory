import { Modal as BaseModal } from "./Modal";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
}) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={undefined}
      showCloseButton={showCloseButton}
      isFullscreen={isFullscreen}
      className={className}
      size="lg"
    >
      {children}
    </BaseModal>
  );
};
