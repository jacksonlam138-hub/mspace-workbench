import type { ReactNode } from 'react';
import { Icon } from '../icons';

export interface ModalState {
  title: string;
  body: ReactNode;
  actions?: ReactNode;
}

export function Modal({ modal, onClose }: { modal: ModalState | null; onClose: () => void }) {
  if (!modal) return null;
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={modal.title}>
      <div className="dialog">
        <div className="dialog-head">
          <h2>{modal.title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
            <Icon name="close" />
          </button>
        </div>
        {modal.body}
        {modal.actions && <div className="dialog-actions">{modal.actions}</div>}
      </div>
    </div>
  );
}
