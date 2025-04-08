export function cleanOldIds(messageIds) {
  const now = new Date();
  const tenMinutesAgo = now.getTime() - 10 * 60 * 1000;

  for (const [key, value] of messageIds) {
    if (value.updatedAt.getTime() < tenMinutesAgo) {
      messageIds.delete(key);
    }
  }
}

export function cleanUpOldMessages(messageTexts) {
  const now = Date.now();
  const oneMinute = 60 * 1000; // One minute in milliseconds

  for (const [key, messages] of messageTexts.entries()) {
    // Filter messages that are not older than one minute
    const recentMessages = messages.filter(
      (message) => now - message.timestamp <= oneMinute
    );

    if (recentMessages.length > 0) {
      // Update the Map with the recent messages
      messageTexts.set(key, recentMessages);
    } else {
      // Remove the key if no recent messages are left
      messageTexts.delete(key);
    }
  }
}
