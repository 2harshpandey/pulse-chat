import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from './TypingIndicator';
import { getPresenceActivityForFile, getPresenceActivityForFiles } from './utils';
import type { UserProfile } from '../UserContext';

describe('Media and File Sending Presence Activity', () => {
  describe('getPresenceActivityForFile & getPresenceActivityForFiles', () => {
    it('identifies audio files correctly', () => {
      expect(getPresenceActivityForFile({ name: 'note.mp3', type: 'audio/mpeg' })).toBe('sending_audio');
      expect(getPresenceActivityForFile({ name: 'voice.wav', type: '' })).toBe('sending_audio');
      expect(getPresenceActivityForFile({ name: 'recording.ogg', type: 'audio/ogg' })).toBe('sending_audio');
      expect(getPresenceActivityForFile({ name: 'sample.m4a', type: '' })).toBe('sending_audio');
    });

    it('identifies image and gif files correctly', () => {
      expect(getPresenceActivityForFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('sending_photo');
      expect(getPresenceActivityForFile({ name: 'pic.png', type: 'image/png' })).toBe('sending_photo');
      expect(getPresenceActivityForFile({ name: 'sticker.gif', type: 'image/gif' })).toBe('sending_gif');
    });

    it('identifies video files correctly', () => {
      expect(getPresenceActivityForFile({ name: 'clip.mp4', type: 'video/mp4' })).toBe('sending_video');
      expect(getPresenceActivityForFile({ name: 'movie.mov', type: 'video/quicktime' })).toBe('sending_video');
      expect(getPresenceActivityForFile({ name: 'stream.webm', type: 'video/webm' })).toBe('sending_video');
    });

    it('identifies documents and other files as sending_file', () => {
      expect(getPresenceActivityForFile({ name: 'document.pdf', type: 'application/pdf' })).toBe('sending_file');
      expect(getPresenceActivityForFile({ name: 'archive.zip', type: 'application/zip' })).toBe('sending_file');
      expect(getPresenceActivityForFile({ name: 'notes.txt', type: 'text/plain' })).toBe('sending_file');
    });

    it('aggregates multiple files into uniform or mixed presence activity', () => {
      const file1 = new File(['1'], 'img1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['2'], 'img2.png', { type: 'image/png' });
      expect(getPresenceActivityForFiles([file1, file2])).toBe('sending_photo');

      const audio1 = new File(['1'], 'song1.mp3', { type: 'audio/mpeg' });
      const audio2 = new File(['2'], 'song2.wav', { type: 'audio/wav' });
      expect(getPresenceActivityForFiles([audio1, audio2])).toBe('sending_audio');

      const video1 = new File(['1'], 'vid.mp4', { type: 'video/mp4' });
      expect(getPresenceActivityForFiles([file1, video1])).toBe('sending_media');

      const doc1 = new File(['1'], 'data.pdf', { type: 'application/pdf' });
      expect(getPresenceActivityForFiles([file1, doc1])).toBe('sending_file');
    });
  });

  describe('TypingIndicator Component with Media Presence', () => {
    it('returns null when no users are active', () => {
      const users: UserProfile[] = [
        { userId: 'user1', username: 'User One', isTyping: false },
      ];
      const { container } = render(<TypingIndicator onlineUsers={users} currentUserId="user2" />);
      expect(container.firstChild).toBeNull();
    });

    it('filters out current user activity so users do not see their own indicator', () => {
      const users: UserProfile[] = [
        { userId: 'current_user', username: 'Me', isTyping: true, activity: 'sending_audio' },
      ];
      const { container } = render(<TypingIndicator onlineUsers={users} currentUserId="current_user" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders sending audio with username and soundwave bars', () => {
      const users: UserProfile[] = [
        { userId: 'user_a', username: 'Alex', isTyping: true, activity: 'sending_audio' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText(/is sending audio\.\.\./i)).toBeInTheDocument();
    });

    it('renders sending photo with username and photo icon', () => {
      const users: UserProfile[] = [
        { userId: 'user_b', username: 'Sam', isTyping: true, activity: 'sending_photo' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Sam')).toBeInTheDocument();
      expect(screen.getByText(/is sending a photo\.\.\./i)).toBeInTheDocument();
    });

    it('renders sending video with username', () => {
      const users: UserProfile[] = [
        { userId: 'user_c', username: 'Jordan', isTyping: true, activity: 'sending_video' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Jordan')).toBeInTheDocument();
      expect(screen.getByText(/is sending a video\.\.\./i)).toBeInTheDocument();
    });

    it('renders sending file with username', () => {
      const users: UserProfile[] = [
        { userId: 'user_d', username: 'Taylor', isTyping: true, activity: 'sending_file' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Taylor')).toBeInTheDocument();
      expect(screen.getByText(/is sending a file\.\.\./i)).toBeInTheDocument();
    });

    it('renders sending GIF with username', () => {
      const users: UserProfile[] = [
        { userId: 'user_e', username: 'Casey', isTyping: true, activity: 'sending_gif' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Casey')).toBeInTheDocument();
      expect(screen.getByText(/is sending a GIF\.\.\./i)).toBeInTheDocument();
    });

    it('renders selecting a GIF with username', () => {
      const users: UserProfile[] = [
        { userId: 'user_f', username: 'Morgan', isTyping: true, activity: 'gif_selecting' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Morgan')).toBeInTheDocument();
      expect(screen.getByText(/is selecting a GIF\.\.\./i)).toBeInTheDocument();
    });

    it('renders standard is typing when activity is typing or undefined', () => {
      const users: UserProfile[] = [
        { userId: 'user_g', username: 'Robin', isTyping: true },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Robin')).toBeInTheDocument();
      expect(screen.getByText(/is typing\.\.\./i)).toBeInTheDocument();
    });

    it('handles multiple users sending audio with plural text', () => {
      const users: UserProfile[] = [
        { userId: 'u1', username: 'Alex', isTyping: true, activity: 'sending_audio' },
        { userId: 'u2', username: 'Sam', isTyping: true, activity: 'sending_audio' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText('Sam')).toBeInTheDocument();
      expect(screen.getByText(/are sending audio\.\.\./i)).toBeInTheDocument();
    });

    it('handles 3+ users with general plural text', () => {
      const users: UserProfile[] = [
        { userId: 'u1', username: 'User1', isTyping: true, activity: 'sending_photo' },
        { userId: 'u2', username: 'User2', isTyping: true, activity: 'sending_photo' },
        { userId: 'u3', username: 'User3', isTyping: true, activity: 'sending_photo' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText(/Several people are sending photos\.\.\./i)).toBeInTheDocument();
    });

    it('displays mixed activities for different users separated by divider', () => {
      const users: UserProfile[] = [
        { userId: 'u1', username: 'Alex', isTyping: true, activity: 'sending_audio' },
        { userId: 'u2', username: 'Sam', isTyping: true, activity: 'typing' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText(/is sending audio\.\.\./i)).toBeInTheDocument();
      expect(screen.getByText('Sam')).toBeInTheDocument();
      expect(screen.getByText(/is typing\.\.\./i)).toBeInTheDocument();
      expect(screen.getByText('·')).toBeInTheDocument();
    });

    it('renders sending_media when user uploads mixed media files', () => {
      const users: UserProfile[] = [
        { userId: 'u_mixed', username: 'Jordan', isTyping: true, activity: 'sending_media' },
      ];
      render(<TypingIndicator onlineUsers={users} currentUserId="me" />);
      expect(screen.getByText('Jordan')).toBeInTheDocument();
      expect(screen.getByText(/is sending a file\.\.\./i)).toBeInTheDocument();
    });
  });
});
