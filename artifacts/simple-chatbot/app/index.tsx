import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type Message = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
};

const QUICK_PROMPTS = [
  'Give me a dinner idea',
  'Help me plan my day',
  'Tell me a joke',
];
const LEGACY_STORAGE_KEY = '@sprout-chat/messages';
const LEGACY_MIGRATED_KEY = '@sprout-chat/supabase-migration-complete';

let messageCounter = 0;

function createMessage(role: Message['role'], text: string): Message {
  messageCounter += 1;
  return {
    id: `message-${Date.now()}-${messageCounter}`,
    role,
    text,
    createdAt: Date.now(),
  };
}

function getWelcomeMessages(): Message[] {
  return [
    createMessage(
      'assistant',
      'I’m a small offline chatbot. Try saying hello, asking for a dinner idea, or asking me to help plan your day.',
    ),
  ];
}

function parseLegacyMessages(raw: string | null): Message[] | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const validMessages = parsed.filter((item): item is Message => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        (candidate.role === 'assistant' || candidate.role === 'user') &&
        typeof candidate.text === 'string' &&
        typeof candidate.createdAt === 'number'
      );
    });

    return validMessages.length > 0 ? validMessages : null;
  } catch {
    return null;
  }
}

function getBotReply(message: string): string {
  const text = message.toLowerCase();

  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    return 'Hello! What would you like to chat about?';
  }

  if (/\b(help|what can you do|what do you do)\b/.test(text)) {
    return 'I can suggest a quick meal, help make a simple plan for your day, or tell a light joke. I work offline, so I’m best at small everyday prompts.';
  }

  if (/\b(your name|who are you|what are you)\b/.test(text)) {
    return 'I’m Sprout, a small offline chatbot. I keep things simple and can help with a few everyday ideas.';
  }

  if (/\b(dinner|recipe|food|cook|meal|lunch)\b/.test(text)) {
    return 'Try a quick chickpea bowl: warm chickpeas with olive oil, paprika, and a pinch of salt. Serve over rice with cucumber and yogurt. It takes about 15 minutes.';
  }

  if (/\b(plan|organize|productive|schedule|today|tasks|todo)\b/.test(text)) {
    return 'Try this simple plan: choose one must-do task, one small task you can finish in 10 minutes, and one break. Start with the must-do, then reassess.';
  }

  if (/\b(joke|funny|laugh)\b/.test(text)) {
    return 'Why did the notebook feel calm? It had everything written down.';
  }

  if (/\b(thanks|thank you|thx)\b/.test(text)) {
    return 'You’re welcome. Want to try another idea?';
  }

  return 'I’m a small offline chatbot, so I don’t know everything yet. Try asking for a quick meal idea, a simple plan for your day, or a light joke. You can also ask “help.”';
}

function getConnectionErrorMessage(error: unknown): string {
  const details =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const code = typeof details.code === 'string' ? details.code : '';
  const message =
    typeof details.message === 'string' ? details.message.toLowerCase() : '';

  if (
    code === 'anonymous_provider_disabled' ||
    (message.includes('anonymous') && message.includes('disabled'))
  ) {
    return 'Enable Anonymous Sign-Ins in Supabase Authentication, then retry.';
  }

  if (code === 'PGRST205' || message.includes('chat_messages')) {
    return 'Run supabase/schema.sql in the Supabase SQL Editor, then retry.';
  }

  return 'Could not load chat history. Check Supabase setup and connection, then retry.';
}

type MessageBubbleProps = {
  message: Message;
  colors: ReturnType<typeof useColors>;
};

function MessageBubble({ message, colors }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <View style={styles.userMessageRow}>
        <View
          style={[
            styles.userBubble,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={[styles.userMessageText, { color: colors.primaryForeground }]}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantMessageRow}>
      <View
        style={[
          styles.assistantMark,
          { backgroundColor: colors.accent },
        ]}
      >
        <Ionicons name="sparkles" size={15} color={colors.accentForeground} />
      </View>
      <View
        style={[
          styles.assistantBubble,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.assistantMessageText, { color: colors.foreground }]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

type TypingIndicatorProps = {
  colors: ReturnType<typeof useColors>;
};

function TypingIndicator({ colors }: TypingIndicatorProps) {
  return (
    <View style={styles.typingRow}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={[styles.typingText, { color: colors.mutedForeground }]}>
        Sprout is thinking
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [messages, setMessages] = useState<Message[]>(getWelcomeMessages);
  const [draft, setDraft] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const hasUserMessage = messages.some((message) => message.role === 'user');
  const webTopInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const composerBottomInset =
    Platform.OS === 'web' ? Math.max(insets.bottom, 34) : Math.max(insets.bottom, 12);

  async function connectAndLoad() {
    setIsReady(false);
    setUserId(null);
    setConnectionError('');

    if (!supabaseConfigured || !supabase) {
      setConnectionError(
        'Supabase is not configured. Check the project URL and anon key secrets.',
      );
      return;
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      let activeSession = session;
      if (!activeSession) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          throw error;
        }
        activeSession = data.session;
      }

      if (!activeSession) {
        throw new Error('Supabase did not create an anonymous session.');
      }

      const activeUserId = activeSession.user.id;
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, user_id, role, content, created_at')
        .eq('user_id', activeUserId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      let restoredMessages: Message[] | null = data.map((row) => ({
        id: row.id,
        role: row.role,
        text: row.content,
        createdAt: Date.parse(row.created_at),
      }));

      if (restoredMessages.length > 0) {
        await AsyncStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      } else if (
        (await AsyncStorage.getItem(LEGACY_MIGRATED_KEY)) !== 'true'
      ) {
        const localMessages = parseLegacyMessages(
          await AsyncStorage.getItem(LEGACY_STORAGE_KEY),
        );

        if (localMessages) {
          const { error: migrationError } = await supabase
            .from('chat_messages')
            .insert(
              localMessages.map((message) => ({
                id: message.id,
                user_id: activeUserId,
                role: message.role,
                content: message.text,
                created_at: new Date(message.createdAt).toISOString(),
              })),
            );

          if (migrationError) {
            throw migrationError;
          }

          restoredMessages = localMessages;
        }

        await AsyncStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      }

      setUserId(activeUserId);
      setMessages(
        restoredMessages.length > 0 ? restoredMessages : getWelcomeMessages(),
      );
      setIsReady(true);
    } catch (error) {
      setConnectionError(getConnectionErrorMessage(error));
    }
  }

  useEffect(() => {
    void connectAndLoad();
  }, []);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    const activeSupabase = supabase;
    const activeUserId = userId;
    if (!text || !isReady || isThinking || !activeSupabase || !activeUserId) {
      return;
    }

    setDraft('');
    setIsThinking(true);
    setConnectionError('');
    const userMessage = createMessage('user', text);
    setMessages((current) => [...current, userMessage]);
    void Haptics.selectionAsync().catch(() => undefined);

    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const assistantMessage = createMessage('assistant', getBotReply(text));
      const { error } = await activeSupabase.from('chat_messages').insert([
        {
          id: userMessage.id,
          user_id: activeUserId,
          role: userMessage.role,
          content: userMessage.text,
          created_at: new Date(userMessage.createdAt).toISOString(),
        },
        {
          id: assistantMessage.id,
          user_id: activeUserId,
          role: assistantMessage.role,
          content: assistantMessage.text,
          created_at: new Date(assistantMessage.createdAt).toISOString(),
        },
      ]);

      if (error) {
        throw error;
      }

      setMessages((current) => [...current, assistantMessage]);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== userMessage.id),
      );
      setDraft(text);
      setConnectionError('Message could not be saved. Check your connection and try again.');
    } finally {
      setIsThinking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function clearConversation() {
    const activeSupabase = supabase;
    const activeUserId = userId;
    if (!isReady || !activeSupabase || !activeUserId) {
      return;
    }

    Alert.alert(
      'Clear this chat?',
      'This permanently removes your saved chat history from Supabase.',
      [
        { text: 'Keep chat', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => void (async () => {
            const { error } = await activeSupabase
              .from('chat_messages')
              .delete()
              .eq('user_id', activeUserId);

            if (error) {
              setConnectionError('Could not clear chat history. Please try again.');
              return;
            }

            setMessages(getWelcomeMessages());
            setConnectionError('');
          })(),
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: webTopInset,
        },
      ]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View
            style={[
              styles.brandMark,
              { backgroundColor: colors.accent },
            ]}
          >
            <Ionicons name="leaf" size={18} color={colors.accentForeground} />
          </View>
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>
              Sprout
            </Text>
            <View style={styles.statusLine}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isReady
                      ? colors.primary
                      : connectionError
                        ? colors.destructive
                        : colors.mutedForeground,
                  },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                {isReady
                  ? 'offline replies · synced'
                  : connectionError
                    ? 'history unavailable'
                    : 'syncing history'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear cloud chat history"
          testID="clear-chat-button"
          hitSlop={12}
          disabled={!isReady || isThinking}
          onPress={clearConversation}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={21} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.conversationHeading}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          A LITTLE HELP, RIGHT HERE
        </Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          What’s on your mind?
        </Text>
      </View>

      <FlatList
        data={reversedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
        inverted={messages.length > 0}
        ListHeaderComponent={isThinking ? <TypingIndicator colors={colors} /> : null}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.messageList}
        style={styles.messageListView}
      />

      <View
        style={[
          styles.composerArea,
          { paddingBottom: composerBottomInset },
        ]}
      >
        {!hasUserMessage && (
          <View style={styles.promptList}>
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                accessibilityRole="button"
                testID={`quick-prompt-${QUICK_PROMPTS.indexOf(prompt)}`}
                disabled={!isReady || isThinking}
                onPress={() => void sendMessage(prompt)}
                style={({ pressed }) => [
                  styles.promptChip,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.promptText, { color: colors.accentForeground }]}>
                  {prompt}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {!!connectionError && (
          <View
            style={[
              styles.connectionNotice,
              { backgroundColor: colors.secondary },
            ]}
          >
            <Text style={[styles.connectionErrorText, { color: colors.destructive }]}>
              {connectionError}
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="retry-supabase-button"
              disabled={isThinking}
              onPress={() => void connectAndLoad()}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[styles.retryText, { color: colors.accentForeground }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            accessibilityLabel="Write a message"
            testID="chat-message-input"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void sendMessage(draft)}
            placeholder={isReady ? 'Message Sprout...' : 'Getting things ready...'}
            placeholderTextColor={colors.mutedForeground}
            editable={isReady && !isThinking}
            returnKeyType="send"
            blurOnSubmit={false}
            maxLength={1200}
            style={[styles.textInput, { color: colors.foreground }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            testID="send-message-button"
            disabled={!draft.trim() || !isReady || isThinking}
            onPress={() => void sendMessage(draft)}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor:
                  draft.trim() && isReady && !isThinking
                    ? colors.primary
                    : colors.secondary,
              },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="arrow-up"
              size={19}
              color={
                draft.trim() && isReady && !isThinking
                  ? colors.primaryForeground
                  : colors.mutedForeground
              }
            />
          </Pressable>
        </View>
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
          {isReady
            ? 'History syncs to this install’s private Supabase session.'
            : 'Finish Supabase setup to sync chat history.'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    minHeight: 62,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.3,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationHeading: {
    paddingTop: 22,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.4,
    marginBottom: 7,
  },
  heading: {
    fontSize: 27,
    lineHeight: 34,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -1,
  },
  messageListView: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 15,
  },
  assistantMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '92%',
  },
  assistantMark: {
    width: 25,
    height: 25,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  assistantBubble: {
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 19,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  assistantMessageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: 42,
  },
  userBubble: {
    maxWidth: '94%',
    borderRadius: 19,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userMessageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter_500Medium',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingLeft: 34,
    paddingVertical: 7,
  },
  typingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  composerArea: {
    paddingTop: 11,
    paddingHorizontal: 18,
    gap: 10,
  },
  promptList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 2,
  },
  promptChip: {
    minHeight: 37,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  connectionNotice: {
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectionErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    lineHeight: 17,
  },
  retryText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  composer: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 6,
  },
  textInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
});
