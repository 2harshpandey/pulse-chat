import React from 'react';
import {
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  RadioGroup,
  RadioLabel,
  Button,
  DangerButton,
} from '../AdminStyledComponents';

export interface AdminModalsProps {
  showPinModal: boolean;
  setShowPinModal: (show: boolean) => void;
  pinDuration: number | null;
  setPinDuration: (dur: number | null) => void;
  handleConfirmDuration: () => void;
  showReplaceModal: boolean;
  setShowReplaceModal: (show: boolean) => void;
  submitPin: (replaceOldest?: boolean) => void;
  showBulkDeleteModal: boolean;
  setShowBulkDeleteModal: (show: boolean) => void;
  selectedMessageCount: number;
  bulkDeleteAction: 'hide' | 'delete';
  setBulkDeleteAction: (action: 'hide' | 'delete') => void;
  bulkDeleteVanish: boolean;
  setBulkDeleteVanish: (vanish: boolean) => void;
  handleBulkActionSubmit: () => void;
  roomId: string;
}

export function AdminModals({
  showPinModal,
  setShowPinModal,
  pinDuration,
  setPinDuration,
  handleConfirmDuration,
  showReplaceModal,
  setShowReplaceModal,
  submitPin,
  showBulkDeleteModal,
  setShowBulkDeleteModal,
  selectedMessageCount,
  bulkDeleteAction,
  setBulkDeleteAction,
  bulkDeleteVanish,
  setBulkDeleteVanish,
  handleBulkActionSubmit,
  roomId,
}: AdminModalsProps) {
  return (
    <>
      {showPinModal && (
        <ModalOverlay onClick={() => setShowPinModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>Choose how long your pin lasts</ModalHeader>
            <ModalBody>You can unpin at any time.</ModalBody>
            <RadioGroup>
              <RadioLabel>
                <input
                  type="radio"
                  name="pinDuration"
                  checked={pinDuration === 24 * 60 * 60 * 1000}
                  onChange={() => setPinDuration(24 * 60 * 60 * 1000)}
                />
                <span>24 hours</span>
              </RadioLabel>
              <RadioLabel>
                <input
                  type="radio"
                  name="pinDuration"
                  checked={pinDuration === 7 * 24 * 60 * 60 * 1000}
                  onChange={() => setPinDuration(7 * 24 * 60 * 60 * 1000)}
                />
                <span>7 days</span>
              </RadioLabel>
              <RadioLabel>
                <input
                  type="radio"
                  name="pinDuration"
                  checked={pinDuration === 30 * 24 * 60 * 60 * 1000}
                  onChange={() => setPinDuration(30 * 24 * 60 * 60 * 1000)}
                />
                <span>30 days</span>
              </RadioLabel>
              <RadioLabel>
                <input
                  type="radio"
                  name="pinDuration"
                  checked={pinDuration === null}
                  onChange={() => setPinDuration(null)}
                />
                <span>Until I unpin or replace</span>
              </RadioLabel>
            </RadioGroup>
            <ModalFooter>
              <Button style={{ background: '#475569', color: '#f1f5f9' }} onClick={() => setShowPinModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmDuration}>Pin</Button>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}

      {showReplaceModal && (
        <ModalOverlay onClick={() => setShowReplaceModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>Replace oldest pin?</ModalHeader>
            <ModalBody>Your new pin will replace the oldest one.</ModalBody>
            <ModalFooter>
              <Button style={{ background: '#475569', color: '#f1f5f9' }} onClick={() => setShowReplaceModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => submitPin(true)}>Continue</Button>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}

      {showBulkDeleteModal && (
        <ModalOverlay>
          <ModalContent>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>Delete {selectedMessageCount} Message(s)</h3>
            </ModalHeader>
            <ModalBody>
              <p style={{ marginBottom: '1rem', color: '#94a3b8' }}>
                Choose how you want to handle the selected messages:
              </p>
              <RadioGroup>
                <RadioLabel>
                  <input
                    type="radio"
                    name="bulkDeleteAction"
                    value="hide"
                    checked={bulkDeleteAction === 'hide'}
                    onChange={() => setBulkDeleteAction('hide')}
                  />
                  <div>
                    <strong>Hide from frontend (Keep in DB)</strong>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                      Shows a deleted bubble to users by default. Original text remains in the database for admins to review.
                    </p>
                  </div>
                </RadioLabel>
                <RadioLabel>
                  <input
                    type="radio"
                    name="bulkDeleteAction"
                    value="delete"
                    checked={bulkDeleteAction === 'delete'}
                    onChange={() => setBulkDeleteAction('delete')}
                  />
                  <div>
                    <strong>Delete from database</strong>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                      Shows a deleted bubble to users by default. The original text and media are permanently scrubbed from the database to save space and ensure privacy.
                    </p>
                  </div>
                </RadioLabel>
              </RadioGroup>

              {(roomId === 'me' || roomId === 'global') && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '8px',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bulkDeleteVanish}
                      onChange={(e) => setBulkDeleteVanish(e.target.checked)}
                      style={{ marginTop: '0.2rem', width: '1.1rem', height: '1.1rem' }}
                    />
                    <div>
                      <strong style={{ display: 'block', color: '#ef4444' }}>Vanish without a trace</strong>
                      <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                        Super Admin only. Do not show a deleted bubble on the frontend. The messages will completely disappear for all users.
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setShowBulkDeleteModal(false)}>Cancel</Button>
              <DangerButton onClick={handleBulkActionSubmit}>Confirm Deletion</DangerButton>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
}
