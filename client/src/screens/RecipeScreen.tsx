import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../services/api';

interface RecipeScreenProps {
  recipes: Recipe[];
  onCookRecipe: (recipeId: string) => void;
  onBack: () => void;
}

export default function RecipeScreen({
  recipes,
  onCookRecipe,
  onBack
}: RecipeScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Recipe Recommendations</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Recipes are ranked dynamically based on inventory coverage and your expiring items to minimise food waste.
        </Text>

        {recipes.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No recipe recommendations available. Add more inventory items!</Text>
          </View>
        ) : (
          recipes.map(recipe => (
            <View key={recipe.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.recipeTitle}>{recipe.title}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{recipe.matchPercentage}% Match</Text>
                </View>
              </View>

              <Text style={styles.desc}>{recipe.description}</Text>

              {recipe.expiringIngredients.length > 0 && (
                <Text style={styles.warningText}>🔥 Uses expiring items: {recipe.expiringIngredients.join(', ')}</Text>
              )}

              {recipe.missingIngredients.length > 0 && (
                <Text style={styles.missingText}>🛒 Missing: {recipe.missingIngredients.join(', ')}</Text>
              )}

              {Object.keys(recipe.substitutions).length > 0 && (
                <Text style={styles.subText}>
                  💡 Substitutions: {Object.entries(recipe.substitutions).map(([k, v]) => `${k} ➔ ${v}`).join(', ')}
                </Text>
              )}

              <View style={styles.divider} />

              <Text style={styles.stepsTitle}>Steps:</Text>
              {recipe.steps.map((step, idx) => (
                <Text key={idx} style={styles.stepText}>{idx + 1}. {step}</Text>
              ))}

              <TouchableOpacity style={styles.cookBtn} onPress={() => onCookRecipe(recipe.id)}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.cookBtnText}>I Cooked This (Deduct Inventory)</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingTop: 48 },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  content: { padding: 16 },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 16, lineHeight: 20 },
  center: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recipeTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', flex: 1, marginRight: 8 },
  badge: { backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  desc: { fontSize: 14, color: '#475569', marginBottom: 10, lineHeight: 20 },
  warningText: { fontSize: 13, fontWeight: 'bold', color: '#ef4444', marginBottom: 4 },
  missingText: { fontSize: 13, color: '#d97706', marginBottom: 4 },
  subText: { fontSize: 13, color: '#0284c7', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
  stepsTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  stepText: { fontSize: 13, color: '#475569', marginBottom: 4, lineHeight: 18 },
  cookBtn: { flexDirection: 'row', backgroundColor: '#16a34a', padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  cookBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15, marginLeft: 8 }
});
