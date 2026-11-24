import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import type { InventoryItem } from '../../../../shared/types';
import { addDays, todayString } from '../../domain/expiry';
import { useInventoryStore } from '../../store/inventoryStore';
import { useSessionStore } from '../../store/sessionStore';
import { api } from '../../data/api';
import ConfirmationScreen from '../ConfirmationScreen';
import InventoryScreen from '../InventoryScreen';

jest.mock('../../data/api', () => ({
  api: { shelfLife: jest.fn(), suggestIngredients: jest.fn() },
}));
const mockApi = api as unknown as { shelfLife: jest.Mock; suggestIngredients: jest.Mock };

const today = todayString();
const Stack = createNativeStackNavigator();
const Blank = () => null;

const renderScreen = (component: React.ComponentType, params?: object) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Screen" component={component} initialParams={params} />
          <Stack.Screen name="Tabs" component={Blank} />
          <Stack.Screen name="Scan" component={Blank} />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>,
  );

const item = (id: string, name: string, days: number, storageLocation: InventoryItem['storageLocation'] = 'FRIDGE'): InventoryItem => ({
  id, name, canonicalId: id, category: 'Produce', storageLocation, quantity: 1, unit: 'unit',
  buyDate: today, expiryEarliest: addDays(today, days), expiryDate: addDays(today, days), expirySource: 'label',
});

beforeEach(() => {
  useInventoryStore.setState({ items: [], revision: 0, recent: [] });
  useSessionStore.setState({ scan: null });
});

describe('InventoryScreen', () => {
  it('groups by storage with colour-coded urgency', async () => {
    useInventoryStore.setState({
      items: [item('a', 'Avocado', 1), item('b', 'Peas', 200, 'FREEZER'), item('c', 'Milk', 4)],
    });
    await renderScreen(InventoryScreen);
    expect(screen.getByText('Fridge · 2')).toBeTruthy();
    expect(screen.getByText('Freezer · 1')).toBeTruthy();
    expect(screen.getAllByTestId('urgency-URGENT')).toHaveLength(1);
    expect(screen.getAllByTestId('urgency-WARNING')).toHaveLength(1);
    expect(screen.getAllByTestId('urgency-SAFE')).toHaveLength(1);

    await fireEvent.press(screen.getByText('Expiring soon (2)'));
    expect(screen.queryByText('Peas')).toBeNull();
  });

  it('shows an empty state', async () => {
    await renderScreen(InventoryScreen);
    expect(screen.getByText('Your pantry is empty')).toBeTruthy();
  });
});

const shelfLife = (name: string, source: 'reference' | 'ai-estimate' = 'reference') => ({
  canonicalId: name.toLowerCase(), name, category: 'Produce' as const, defaultStorage: 'FRIDGE' as const, source,
  ranges: { pantry: null, fridge: { min: 3, max: 7 }, freezer: null },
});

describe('ConfirmationScreen', () => {
  it('pre-fills printed dates read from the photo and sets dates with one tap', async () => {
    const printed = addDays(today, 10);
    useSessionStore.setState({
      scan: {
        source: 'gemini_vision',
        items: [
          { label: 'milk', name: 'Milk', canonicalId: 'milk', category: 'Produce', confidence: 0.9, quantity: 1, unit: 'carton', storageLocation: 'FRIDGE', shelfLife: shelfLife('Milk'), printedDate: printed },
          { label: 'kefir', name: 'Kefir', canonicalId: 'kefir', category: 'Produce', confidence: 0.9, quantity: 1, unit: 'unit', storageLocation: 'FRIDGE', shelfLife: shelfLife('Kefir', 'ai-estimate'), ripeness: 'overripe' },
        ],
      },
    });
    await renderScreen(ConfirmationScreen);
    expect(screen.getByText(/read from the label, please check/)).toBeTruthy();
    expect(screen.getByText('AI shelf-life estimate')).toBeTruthy();
    expect(screen.getByText('Looks overripe')).toBeTruthy();

    // Second item: tap "+2 weeks", then open the calendar.
    await fireEvent.press(screen.getAllByText('+2 weeks')[1]);
    await fireEvent.press(screen.getAllByText('Pick date…')[1]);
    expect(screen.getByTestId('expiry-date-picker')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-save'));

    const saved = useInventoryStore.getState().items;
    expect(saved.map(i => [i.name, i.expiryDate, i.expirySource])).toEqual([
      ['Milk', printed, 'label'],
      ['Kefir', addDays(today, 14), 'label'],
    ]);
  });

  it('flags low-confidence detections and saves only confirmed items', async () => {
    useSessionStore.setState({
      scan: {
        source: 'gemini_vision',
        items: [
          { label: 'spinach', name: 'Spinach', canonicalId: 'spinach', category: 'Produce', confidence: 0.92, quantity: 1, unit: 'bag', storageLocation: 'FRIDGE', shelfLife: shelfLife('Spinach') },
          { label: 'jar', name: 'Mystery Jar', canonicalId: 'mystery_jar', category: 'Produce', confidence: 0.3, quantity: 1, unit: 'jar', storageLocation: 'FRIDGE', shelfLife: shelfLife('Mystery Jar') },
        ],
      },
    });
    await renderScreen(ConfirmationScreen);
    expect(screen.getByText('30% confident — please check')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove Mystery Jar'));
    await fireEvent.press(screen.getByTestId('confirm-save'));

    const saved = useInventoryStore.getState().items;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Spinach', canonicalId: 'spinach', unit: 'bag', expiryDate: addDays(today, 7), expiryEarliest: addDays(today, 3) });
  });
});

describe('ConfirmationScreen manual entry', () => {
  const chicken = {
    canonicalId: 'chicken_breast', name: 'Chicken Breast', category: 'Meat & Seafood' as const, defaultStorage: 'FRIDGE' as const,
    source: 'reference' as const, ranges: { pantry: null, fridge: { min: 1, max: 2 }, freezer: { min: 270, max: 270 } },
  };
  beforeEach(() => {
    mockApi.shelfLife.mockReset().mockResolvedValue(chicken);
    mockApi.suggestIngredients.mockReset().mockResolvedValue({ items: [chicken] });
  });

  it('uses the food-specific shelf life even when Save is tapped straight after typing', async () => {
    await renderScreen(ConfirmationScreen, { manual: true });
    await fireEvent.changeText(screen.getByPlaceholderText('Food name, e.g. spinach'), 'chicken breast');
    await fireEvent.press(screen.getByTestId('confirm-save'));
    await waitFor(() => expect(useInventoryStore.getState().items).toHaveLength(1));
    expect(mockApi.shelfLife).toHaveBeenCalledWith('chicken breast');
    expect(useInventoryStore.getState().items[0]).toMatchObject({
      canonicalId: 'chicken_breast', expiryEarliest: addDays(today, 1), expiryDate: addDays(today, 2),
    });
  });

  it('suggests foods while typing, and offers to merge duplicates instead of a checkbox', async () => {
    await renderScreen(ConfirmationScreen, { manual: true });
    await fireEvent.changeText(screen.getByPlaceholderText('Food name, e.g. spinach'), 'chick');
    await fireEvent.press(await screen.findByText('Chicken Breast', {}, { timeout: 2000 }));
    expect(screen.getByText(/Estimated expiry/)).toBeTruthy();
    expect(screen.queryByLabelText(/to merge/)).toBeNull();

    await fireEvent.press(screen.getByText('Add another item'));
    const inputs = screen.getAllByPlaceholderText('Food name, e.g. spinach');
    await fireEvent.changeText(inputs[1], 'Chicken Breast');
    await fireEvent.press(await screen.findByText('Merge'));
    expect(screen.getAllByPlaceholderText('Food name, e.g. spinach')).toHaveLength(1);
  });

  it('remembers what was added and re-adds it with one tap', async () => {
    useInventoryStore.getState().addItems([{ ...item('chicken_breast', 'Chicken Breast', 2), category: 'Meat & Seafood', quantity: 500, unit: 'g' }]);
    useInventoryStore.setState({ items: [] });
    expect(useInventoryStore.getState().recent.map(f => f.name)).toEqual(['Chicken Breast']);

    await renderScreen(ConfirmationScreen, { manual: true });
    expect(screen.getByText('Recently added')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recent-Chicken Breast'));
    await waitFor(() => expect(screen.getByText(/Estimated expiry/)).toBeTruthy());
    expect(screen.queryByText('Recently added')).toBeNull(); // already on the list
    await fireEvent.press(screen.getByTestId('confirm-save'));
    await waitFor(() => expect(useInventoryStore.getState().items).toHaveLength(1));
    expect(useInventoryStore.getState().items[0]).toMatchObject({ name: 'Chicken Breast', quantity: 500, unit: 'g', expiryDate: addDays(today, 2) });
  });
});
