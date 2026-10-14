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

type Message = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
};

const STORAGE_KEY = '@sprout-chat/messages';
const QUICK_PROMPTS = [
  'Give me a dinner idea',
  'Help me plan my day',
  'Tell me a joke',
];

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

function parseMessages(raw: string | null): Message[] | null {
  if (!raw) {
    return null;
  }

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
  const [storageWarning, setStorageWarning] = useState('');
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const hasUserMessage = messages.some((message) => message.role === 'user');
  const webTopInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const composerBottomInset =
    Platform.OS === 'web' ? Math.max(insets.bottom, 34) : Math.max(insets.bottom, 12);

  useEffect(() => {
    let isMounted = true;

    async function loadConversation() {
      try {
        const savedMessages = parseMessages(await AsyncStorage.getItem(STORAGE_KEY));
        if (isMounted && savedMessages) {
          setMessages(savedMessages);
        }
      } catch {
        if (isMounted) {
          setStorageWarning('Saved chat history could not be restored.');
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void loadConversation();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages)).catch(() => {
      setStorageWarning('Chat history could not be saved on this device.');
    });
  }, [isReady, messages]);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || !isReady || isThinking) {
      return;
    }

    setDraft('');
    setIsThinking(true);
    setStorageWarning('');
    setMessages((current) => [...current, createMessage('user', text)]);
    void Haptics.selectionAsync().catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 450));
    setMessages((current) => [
      ...current,
      createMessage('assistant', getBotReply(text)),
    ]);
    setIsThinking(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearConversation() {
    Alert.alert(
      'Clear this chat?',
      'This removes the saved conversation from this device.',
      [
        { text: 'Keep chat', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setMessages([
              createMessage(
                'assistant',
                'This conversation is cleared. I’m here whenever you want to start again.',
              ),
            ]);
            setStorageWarning('');
          },
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
              <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                offline and ready
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear conversation"
          testID="clear-chat-button"
          hitSlop={12}
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

        {!!storageWarning && (
          <Text style={[styles.storageWarning, { color: colors.destructive }]}>
            {storageWarning}
          </Text>
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
          Your conversation stays on this device.
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
  storageWarning: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 3,
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
