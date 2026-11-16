/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icons need native font loading, which isn't available under Jest; render a placeholder instead.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, accessibilityLabel }) => React.createElement(Text, { accessibilityLabel }, name);
  Icon.glyphMap = {};
  return { Ionicons: Icon };
});

// Swiping needs the native gesture + Reanimated runtime; under Jest render rows without it.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Swipeable = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({ close() {}, openLeft() {}, openRight() {}, reset() {} }));
    return React.createElement(View, null, children);
  });
  return { __esModule: true, default: Swipeable };
});
