import { Feather } from '@expo/vector-icons'
import NetInfo from '@react-native-community/netinfo'
import { Subscription } from '@unimodules/core'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as Permissions from 'expo-permissions'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { AppearanceProvider, useColorScheme } from 'react-native-appearance'
import { getBottomSpace } from 'react-native-iphone-x-helper'
import { WebView, WebViewNavigation } from 'react-native-webview'
import AppIcon from './assets/icon-arrow-only.png'
import { env } from './env'

const isDev = process.env.NODE_ENV === 'development'
const eodiroUrl = isDev ? `http://${env.IP}:3020` : 'https://eodiro.com'

// Notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function askForNotificationsPermission() {
  if (Constants.isDevice) {
    const { status: existingStatus } = await Permissions.getAsync(
      Permissions.NOTIFICATIONS
    )

    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Permissions.askAsync(Permissions.NOTIFICATIONS)
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      return
    }
  } else {
    alert('Must use physical device for Push Notifications')
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    })
  }
}

function App() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('')
  const [
    notification,
    setNotification,
  ] = useState<Notifications.Notification | null>(null)
  const isLoaded = useRef(false)
  const postponedWebViewRedirectMessage = useRef('')

  const notificationListener = useRef<Subscription>({ remove: () => {} })
  const responseListener = useRef<Subscription>({ remove: () => {} })

  const [hasError, setHasError] = useState(false)

  const [webViewUrl, setWebViewUrl] = useState(eodiroUrl)

  const colorScheme = useColorScheme()
  const webView = useRef<WebView | null>()
  const [
    navigationState,
    setNavigationState,
  ] = useState<WebViewNavigation | null>(null)

  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // This listener is fired whenever a notification is received
    // while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotification(notification)
      }
    )

    // This listener is fired whenever a user taps on or interacts
    // with a notification (works when app is foregrounded, backgrounded, or killed)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const { data } = response.notification.request.content

        if (isDev) {
          console.log(data)
        }

        if (data.type === 'notice' && data.url) {
          if (!data.url) {
            alert('공지사항 페이지로 이동할 수 없습니다.')
          } else {
            WebBrowser.openBrowserAsync(data.url as string)
          }
        } else if (data.type === 'comment') {
          let url = `/community/board/${data.boardId}/post/${data.postId}`

          if (data.commentId) {
            url += `?commentId=${data.commentId}`
          } else if (data.subcommentId) {
            url += `?subcommentId=${data.subcommentId}`
          }

          if (isLoaded.current) {
            // Post message when the webview is loaded
            webView.current?.postMessage(
              JSON.stringify({
                type: 'redirect',
                url,
              })
            )
          } else {
            // Postpone the redirection
            postponedWebViewRedirectMessage.current = JSON.stringify({
              type: 'redirect',
              url,
            })
          }
        }
      }
    )

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      setHasError(!state.isConnected)
    })

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current)
      Notifications.removeNotificationSubscription(responseListener.current)
      unsubscribeNetInfo()
    }
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <View
        style={{
          height: Constants.statusBarHeight,
          backgroundColor: colorScheme === 'light' ? '#f3f4f7' : '#000000',
        }}
      />
      <WebView
        source={{
          uri: webViewUrl,
          headers: {
            'eodiro-agent': 'expo',
          },
        }}
        bounces={false}
        onError={() => {
          setHasError(true)
        }}
        onLoad={() => {
          if (isLoaded.current === false) {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }).start()
          } else {
            isLoaded.current = true
          }
        }}
        onMessage={async (e) => {
          const { data } = e.nativeEvent
          const parsed = JSON.parse(data)

          if (parsed.isLoaded) {
            setTimeout(() => {
              askForNotificationsPermission()

              isLoaded.current = true

              setTimeout(() => {
                if (postponedWebViewRedirectMessage.current) {
                  webView.current?.postMessage(
                    postponedWebViewRedirectMessage.current
                  )
                  postponedWebViewRedirectMessage.current = ''
                }
              }, 300)
            }, 200)
          } else if (parsed.requestExpoPushToken) {
            const expoPushToken = (await Notifications.getExpoPushTokenAsync())
              .data

            webView.current?.postMessage(
              JSON.stringify({
                type: 'registerPush',
                expoPushToken,
              })
            )
          }
        }}
        allowsLinkPreview
        decelerationRate="normal"
        style={styles.webView}
        ref={(wv) => (webView.current = wv)}
        onNavigationStateChange={(navigation) => {
          setNavigationState(navigation)

          if (!navigation.url.startsWith(eodiroUrl)) {
            webView.current?.stopLoading()
            WebBrowser.openBrowserAsync(navigation.url)
            return
          }

          webView.current?.postMessage(
            JSON.stringify({
              type: 'setCanGoBack',
              value: navigation.canGoBack,
            })
          )
        }}
      />
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colorScheme === 'light' ? '#f3f4f7' : '#000',
          paddingBottom: getBottomSpace(),
        }}
      >
        <TouchableOpacity
          style={{ ...styles.navigationButton }}
          onPress={() => {
            webView.current?.goBack()
          }}
        >
          <Feather
            name="chevron-left"
            size={30}
            color={colorScheme === 'light' ? '#000' : '#fff'}
            style={{
              opacity: navigationState?.canGoBack ? 1 : 0.2,
            }}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ ...styles.navigationButton }}
          onPress={() => {
            webView.current?.postMessage('reload')
          }}
        >
          <Feather
            name="rotate-cw"
            size={24}
            color={colorScheme === 'light' ? '#000' : '#fff'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ ...styles.navigationButton }}
          onPress={() => {
            webView.current?.goForward()
          }}
        >
          <Feather
            name="chevron-right"
            size={30}
            color={colorScheme === 'light' ? '#000' : '#fff'}
            style={{
              opacity: navigationState?.canGoForward ? 1 : 0.2,
            }}
          />
        </TouchableOpacity>
      </View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          opacity: fadeAnim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      {hasError && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Image
              source={AppIcon}
              style={{
                width: 100,
                height: 100,
                marginBottom: 30,
              }}
            />
            <Text style={styles.connectionErrorText}>
              서비스에 접속하지 못했습니다.
            </Text>
            <Text style={styles.connectionErrorText}>
              같은 문제가 지속될시 문의바랍니다.
            </Text>
            <Text style={styles.connectionErrorText}>support@eodiro.com</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  webView: {},
  navigationButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 50,
  },
  connectionErrorText: {
    color: '#fff',
    lineHeight: 22,
    fontSize: 14,
  },
})

export default function Main() {
  return (
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  )
}
