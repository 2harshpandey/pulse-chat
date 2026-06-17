import fs from 'fs';

let code = fs.readFileSync('src/Chat.tsx', 'utf8');

// 1. Remove VirtuosoRef
code = code.replace(/const virtuosoRef = useRef[^\n]+\n/, '');

// 2. Remove virtuoso parameters from scrollToMessage
code = code.replace(/if \(!virtuosoRef\.current\) \{[\s\S]*?return false;\n\s*\}\n/, '');
code = code.replace(/const absoluteIndex = [\s\S]*?const relativeIndex = msgIndex;\n/, '');

// 3. Replace all scrollToIndex calls inside scrollToMessage with DOM scrollIntoView
const replacementScroll = `
    const element = findMessageElement(targetId);
    if (element) {
      element.scrollIntoView({ behavior, block: 'center' });
    }
`;
code = code.replace(/virtuosoRef\.current\?\.scrollToIndex\(\{[\s\S]*?\}\);/g, replacementScroll);

// 4. Remove scrollToBottom virtuoso logic
code = code.replace(/if \(virtuosoRef\.current && latestIndex >= firstItemIndexRef\.current\) \{[\s\S]*?\}\n/, 'applyScrollerBottom();\n');

// 5. Replace Virtuoso component with native mapped div
const nativeScroller = `
                <div style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'auto', display: 'flex', flexDirection: 'column' }}
                     onScroll={(e) => {
                       const target = e.target;
                       if (target.scrollTop < 500 && !isLoadingOlderRef.current && hasMoreOlderMessages) {
                         loadOlderMessages();
                       }
                       const distanceFromBottom = target.scrollHeight - (target.scrollTop + target.clientHeight);
                       const atBottom = distanceFromBottom <= 20;
                       handleAtBottomStateChange(atBottom);
                     }}
                >
                  {messages.map((msg, index) => {
                    if (msg.type === 'system_notification') {
                      return (
                        <div key={msg.id || index} style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem 0' }}>
                          <SystemMessage>{msg.text}</SystemMessage>
                        </div>
                      );
                    }
                    const dataIndex = index;
                    const prevMsg = dataIndex > 0 ? messages[dataIndex - 1] : null;
                    const showUsername = groupStartMessageIdsRef.current.has(msg.id);
                    return (
                      <MessageItem
                        key={msg.id}
                        msg={msg}
                        showUsername={showUsername}
                        currentUserId={userIdRef.current}
                        handleSetReply={handleSetReply}
                        handleReact={handleReact}
                        openDeleteMenu={handleOpenDeleteMenu}
                        openLightbox={openLightbox}
                        isMediaLoaded={loadedMediaMessageSet.has(msg.id)}
                        onRequestMediaLoad={handleRequestMediaLoad}
                        isMediaLoadInProgress={Object.prototype.hasOwnProperty.call(mediaLoadProgressById, msg.id)}
                        mediaLoadProgress={mediaLoadProgressById[msg.id] ?? 0}
                        loadedMediaSrc={loadedMediaSrcById[msg.id]}
                        onRequestDownload={handleRequestDownload}
                        isDownloadInProgress={Object.prototype.hasOwnProperty.call(downloadProgressById, msg.id)}
                        downloadProgress={downloadProgressById[msg.id] ?? 0}
                        activeDeleteMenu={activeDeleteMenu}
                        deleteMenuRef={deleteMenuRef}
                        deleteForMe={deleteForMe}
                        deleteForEveryone={deleteForEveryone}
                        scrollToMessage={scrollToMessage}
                        isSelectModeActive={isSelectModeActive}
                        isSelected={selectedMessageIds.has(msg.id)}
                        handleToggleSelectMessage={handleToggleSelectMessage}
                        setActiveDeleteMenu={setActiveDeleteMenu}
                        handleCopy={handleCopy}
                        handleOpenReport={handleOpenReport}
                        handleStartEdit={handleStartEdit}
                        handleCancelSelectMode={handleCancelSelectMode}
                        isMobileView={isMobileView}
                        selectedMessages={selectedMessages}
                        onOpenReactionPicker={handleOpenReactionPicker}
                        setReactionsPopup={setReactionsPopup}
                        handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
                        reactionPickerData={reactionPickerData}
                        editingMessageId={editingMessageId}
                        handleCancelEdit={handleCancelEdit}
                        onVideoFullscreenEnter={handleVideoFullscreenEnter}
                      />
                    );
                  })}
                  <div style={{ height: '12px', flexShrink: 0 }} />
                </div>
`;

code = code.replace(/<Virtuoso[\s\S]*?<\/MessagesContainer>/, nativeScroller + '\n              </MessagesContainer>');

fs.writeFileSync('src/Chat.tsx', code);
console.log('Successfully written to Chat.tsx');
