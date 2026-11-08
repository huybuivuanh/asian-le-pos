import SafeAreaViewWrapper from "@/layout/SafeAreaViewWrapper";
import { auth } from "@/lib/firebaseConfig";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid-credential") || m.includes("wrong-password")) {
    return "Email or password is incorrect.";
  }
  if (m.includes("user-not-found")) {
    return "No account found for this email.";
  }
  if (m.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (m.includes("too-many-requests")) {
    return "Too many attempts. Try again later.";
  }
  if (m.includes("network")) {
    return "Network error. Check your connection.";
  }
  return "Sign in failed. Please try again.";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { user, accessError } = useAuth();
  const { width, height } = useWindowDimensions();

  // Leave only once the account passed the POS access check (AuthProvider),
  // not as soon as Firebase accepts the password.
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const shownError = error || accessError || "";

  const formWidth = useMemo(() => {
    const horizontalPadding = width < 480 ? 24 : width < 768 ? 40 : 48;
    return Math.min(420, width - horizontalPadding * 2);
  }, [width]);

  const verticalPadding = useMemo(() => {
    return height < 560 ? 16 : height < 700 ? 24 : 32;
  }, [height]);

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    setError("");
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, trimmed, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(mapAuthError(msg));
    } finally {
      setSubmitting(false);
    }
  }, [email, password]);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <SafeAreaViewWrapper className="flex-1 bg-slate-100">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingVertical: verticalPadding,
            paddingHorizontal: Math.max(16, (width - formWidth) / 2),
            minHeight: height - 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{ width: formWidth, alignSelf: "center" }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
          >
            <View className="px-5 pt-8 pb-2 sm:px-7 sm:pt-10">
              <Text className="text-2xl font-bold text-slate-900 tracking-tight">
                Asian Le POS
              </Text>
              <Text className="text-base text-slate-500 mt-1.5">
                Sign in to continue
              </Text>
            </View>

            <View className="px-5 pb-8 pt-4 sm:px-7 sm:pb-10 gap-4">
              {shownError ? (
                <View
                  className="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5"
                  accessibilityRole="alert"
                >
                  <Text className="text-sm text-red-700 leading-5">
                    {shownError}
                  </Text>
                </View>
              ) : null}

              <View>
                <Text
                  className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5"
                  nativeID="login-email-label"
                >
                  Email
                </Text>
                <TextInput
                  placeholder="you@restaurant.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (error) setError("");
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  editable={!submitting}
                  className="border border-slate-200 rounded-xl px-4 py-3.5 text-base text-slate-900 bg-slate-50/80"
                  returnKeyType="next"
                  accessibilityLabel="Email"
                  accessibilityLabelledBy="login-email-label"
                />
              </View>

              <View>
                <Text
                  className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5"
                  nativeID="login-password-label"
                >
                  Password
                </Text>
                <View className="relative">
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      if (error) setError("");
                    }}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="password"
                    editable={!submitting}
                    className="border border-slate-200 rounded-xl px-4 py-3.5 pr-12 text-base text-slate-900 bg-slate-50/80"
                    returnKeyType="go"
                    onSubmitEditing={canSubmit ? handleLogin : undefined}
                    accessibilityLabel="Password"
                    accessibilityLabelledBy="login-password-label"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-0 bottom-0 justify-center w-10 items-center active:opacity-60"
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    hitSlop={8}
                  >
                    {showPassword ? (
                      <EyeOff size={22} color="#64748b" />
                    ) : (
                      <Eye size={22} color="#64748b" />
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={handleLogin}
                disabled={!canSubmit}
                className={`rounded-xl py-4 items-center justify-center min-h-[52px] ${
                  canSubmit ? "bg-blue-700 active:bg-blue-800" : "bg-slate-300"
                }`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                accessibilityLabel="Sign in"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-base font-semibold">
                    Sign in
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          <Text className="text-center text-xs text-slate-400 mt-6 px-4">
            Staff use only. Contact your admin if you need access.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaViewWrapper>
  );
}
