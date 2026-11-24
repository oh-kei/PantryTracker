import type { RecipeCandidate } from '../domain/ranking';

type Basic = Omit<RecipeCandidate, 'id' | 'source' | 'category' | 'description'> & { minutes: number };

const ing = (name: string, measure: string) => ({ name, measure });

/**
 * Simple everyday recipes, written for this app. TheMealDB is mostly full
 * dinners, so these cover the quick "what can I make with eggs and bread" cases.
 * Ingredient names use the same words as the shelf-life taxonomy so they match the inventory.
 */
const BASICS: Basic[] = [
  {
    title: 'Scrambled Eggs', cuisine: 'British', servings: 1, minutes: 5,
    ingredients: [ing('Eggs', '3'), ing('Butter', '1 tbsp'), ing('Milk', '2 tbsp'), ing('Salt', 'pinch'), ing('Black Pepper', 'pinch')],
    steps: ['Whisk the eggs with the milk, salt and pepper.', 'Melt the butter in a pan over a low heat.', 'Add the eggs and stir gently until just set.', 'Take off the heat while still soft and serve.'],
  },
  {
    title: 'Cheese Omelette', cuisine: 'French', servings: 1, minutes: 8,
    ingredients: [ing('Eggs', '3'), ing('Cheddar Cheese', '30 g'), ing('Butter', '1 tsp'), ing('Salt', 'pinch')],
    steps: ['Beat the eggs with a pinch of salt.', 'Melt the butter in a frying pan over a medium heat.', 'Pour in the eggs and tilt the pan so they cover the base.', 'When almost set, scatter over the grated cheese, fold in half and slide onto a plate.'],
  },
  {
    title: 'Tomato and Egg Stir-Fry', cuisine: 'Chinese', servings: 2, minutes: 10,
    ingredients: [ing('Eggs', '3'), ing('Tomatoes', '2'), ing('Spring Onions', '2'), ing('Sugar', '1 tsp'), ing('Vegetable Oil', '2 tbsp'), ing('Salt', 'pinch')],
    steps: ['Cut the tomatoes into wedges and slice the spring onions.', 'Beat the eggs with a pinch of salt, scramble in half the oil until just set, then tip out.', 'Fry the tomatoes in the rest of the oil until soft and juicy, then add the sugar.', 'Return the eggs, stir together, top with spring onions and serve with rice.'],
  },
  {
    title: 'Egg Fried Rice', cuisine: 'Chinese', servings: 2, minutes: 15,
    ingredients: [ing('Rice', '300 g cooked'), ing('Eggs', '2'), ing('Peas', '50 g'), ing('Spring Onions', '2'), ing('Soy Sauce', '1 tbsp'), ing('Vegetable Oil', '1 tbsp')],
    steps: ['Heat the oil in a wok or large pan until very hot.', 'Scramble the eggs, then push them to one side.', 'Add the rice (day-old works best) and peas and stir-fry for 3–4 minutes.', 'Stir in the soy sauce and spring onions and serve.'],
  },
  {
    title: 'Steamed Egg Custard', cuisine: 'Chinese', servings: 2, minutes: 15,
    ingredients: [ing('Eggs', '2'), ing('Water', '200 ml'), ing('Soy Sauce', '1 tsp'), ing('Sesame Oil', '1/2 tsp'), ing('Spring Onions', '1')],
    steps: ['Beat the eggs with the water and a pinch of salt, then strain into a bowl.', 'Cover the bowl with a plate and steam over a low heat for 10–12 minutes until just set.', 'Drizzle with soy sauce and sesame oil and scatter over sliced spring onion.'],
  },
  {
    title: 'Simple Tomato Pasta', cuisine: 'Italian', servings: 2, minutes: 20,
    ingredients: [ing('Pasta', '200 g'), ing('Chopped Tomatoes', '1 tin'), ing('Onion', '1'), ing('Garlic', '2 cloves'), ing('Olive Oil', '1 tbsp'), ing('Basil', 'a few leaves')],
    steps: ['Cook the pasta in salted boiling water.', 'Meanwhile soften the chopped onion and garlic in the oil for 5 minutes.', 'Add the tomatoes and simmer for 10 minutes, then season.', 'Toss the drained pasta in the sauce and top with basil.'],
  },
  {
    title: 'Garlic Butter Pasta', cuisine: 'Italian', servings: 2, minutes: 15,
    ingredients: [ing('Pasta', '200 g'), ing('Butter', '40 g'), ing('Garlic', '3 cloves'), ing('Parmesan', '30 g'), ing('Parsley', 'small handful')],
    steps: ['Cook the pasta, keeping a mug of the cooking water.', 'Gently cook the sliced garlic in the butter until fragrant.', 'Add the pasta with a splash of the water and toss until glossy.', 'Stir in the parmesan and chopped parsley.'],
  },
  {
    title: 'Easy Spaghetti Bolognese', cuisine: 'Italian', servings: 4, minutes: 40,
    ingredients: [ing('Beef Mince', '500 g'), ing('Spaghetti', '400 g'), ing('Onion', '1'), ing('Carrot', '1'), ing('Garlic', '2 cloves'), ing('Chopped Tomatoes', '2 tins'), ing('Olive Oil', '1 tbsp')],
    steps: ['Soften the finely chopped onion, carrot and garlic in the oil.', 'Add the mince and brown it all over.', 'Pour in the tomatoes and simmer for 25 minutes, then season.', 'Serve over cooked spaghetti.'],
  },
  {
    title: 'Tuna Pasta Salad', cuisine: 'British', servings: 2, minutes: 15,
    ingredients: [ing('Pasta', '150 g'), ing('Tuna', '1 tin'), ing('Sweetcorn', '100 g'), ing('Mayonnaise', '3 tbsp'), ing('Cucumber', '1/2')],
    steps: ['Cook the pasta, drain and rinse under cold water.', 'Mix with the drained tuna, sweetcorn, diced cucumber and mayonnaise.', 'Season and chill until ready to eat.'],
  },
  {
    title: 'Vegetable Stir-Fry', cuisine: 'Chinese', servings: 2, minutes: 15,
    ingredients: [ing('Broccoli', '1 small head'), ing('Carrot', '1'), ing('Bell Pepper', '1'), ing('Garlic', '2 cloves'), ing('Ginger', '1 thumb'), ing('Soy Sauce', '2 tbsp'), ing('Vegetable Oil', '1 tbsp')],
    steps: ['Cut the vegetables into bite-sized pieces.', 'Stir-fry the garlic and ginger in hot oil for 30 seconds.', 'Add the vegetables and stir-fry for 4–5 minutes, keeping them crunchy.', 'Add the soy sauce, toss and serve with rice or noodles.'],
  },
  {
    title: 'Garlic Bok Choy', cuisine: 'Chinese', servings: 2, minutes: 8,
    ingredients: [ing('Bok Choy', '300 g'), ing('Garlic', '3 cloves'), ing('Oyster Sauce', '1 tbsp'), ing('Vegetable Oil', '1 tbsp')],
    steps: ['Halve the bok choy and rinse well.', 'Fry the sliced garlic in hot oil until golden.', 'Add the bok choy and a splash of water, cover and cook for 2 minutes.', 'Stir in the oyster sauce and serve.'],
  },
  {
    title: 'Smashed Cucumber Salad', cuisine: 'Chinese', servings: 2, minutes: 10,
    ingredients: [ing('Cucumber', '1'), ing('Garlic', '1 clove'), ing('Soy Sauce', '1 tbsp'), ing('Rice Vinegar', '1 tbsp'), ing('Sesame Oil', '1 tsp')],
    steps: ['Lightly smash the cucumber with the flat of a knife and cut into chunks.', 'Toss with a pinch of salt and leave for 5 minutes, then drain.', 'Mix with the crushed garlic, soy sauce, vinegar and sesame oil.'],
  },
  {
    title: 'Chicken Noodle Soup', cuisine: 'Chinese', servings: 2, minutes: 20,
    ingredients: [ing('Noodles', '150 g'), ing('Chicken Breast', '1'), ing('Chicken Stock', '750 ml'), ing('Spinach', '2 handfuls'), ing('Ginger', '1 thumb'), ing('Spring Onions', '2'), ing('Soy Sauce', '1 tbsp')],
    steps: ['Bring the stock to a simmer with the sliced ginger.', 'Add the thinly sliced chicken and simmer for 8 minutes until cooked through.', 'Add the noodles and cook as the packet says, then stir in the spinach.', 'Season with soy sauce and top with spring onions.'],
  },
  {
    title: 'One-Pan Chicken and Rice', cuisine: 'American', servings: 4, minutes: 40,
    ingredients: [ing('Chicken Thighs', '4'), ing('Rice', '250 g'), ing('Onion', '1'), ing('Garlic', '2 cloves'), ing('Chicken Stock', '600 ml'), ing('Peas', '100 g'), ing('Olive Oil', '1 tbsp')],
    steps: ['Season and brown the chicken in the oil, then set aside.', 'Soften the onion and garlic in the same pan, then stir in the rice.', 'Pour in the stock, put the chicken back on top, cover and simmer for 20 minutes.', 'Stir in the peas, cover for 5 more minutes and serve.'],
  },
  {
    title: 'Pan-Fried Salmon with Lemon', cuisine: 'French', servings: 2, minutes: 15,
    ingredients: [ing('Salmon', '2 fillets'), ing('Lemon', '1'), ing('Butter', '20 g'), ing('Garlic', '1 clove'), ing('Salt', 'pinch')],
    steps: ['Pat the salmon dry and season with salt.', 'Fry skin-side down in a hot pan for 4 minutes, then flip for 2–3 minutes.', 'Add the butter and crushed garlic and spoon over the fish.', 'Finish with a squeeze of lemon.'],
  },
  {
    title: 'Vegetable Soup', cuisine: 'British', servings: 4, minutes: 35,
    ingredients: [ing('Onion', '1'), ing('Carrots', '2'), ing('Celery', '2 sticks'), ing('Potatoes', '2'), ing('Chopped Tomatoes', '1 tin'), ing('Vegetable Stock', '1 litre'), ing('Olive Oil', '1 tbsp')],
    steps: ['Chop all the vegetables into small pieces.', 'Soften the onion, carrot and celery in the oil for 5 minutes.', 'Add the potatoes, tomatoes and stock and simmer for 20 minutes.', 'Season, and blend if you like it smooth.'],
  },
  {
    title: 'Roast Vegetables', cuisine: 'British', servings: 4, minutes: 45,
    ingredients: [ing('Potatoes', '3'), ing('Carrots', '3'), ing('Onion', '1'), ing('Courgette', '1'), ing('Olive Oil', '3 tbsp'), ing('Rosemary', '2 sprigs')],
    steps: ['Heat the oven to 200°C (180°C fan).', 'Cut the vegetables into similar-sized chunks.', 'Toss with the oil, rosemary and seasoning on a tray.', 'Roast for 35–40 minutes, turning halfway, until golden.'],
  },
  {
    title: 'Loaded Baked Potato', cuisine: 'British', servings: 2, minutes: 70,
    ingredients: [ing('Potatoes', '2 large'), ing('Butter', '20 g'), ing('Cheddar Cheese', '60 g'), ing('Spring Onions', '1')],
    steps: ['Prick the potatoes and bake at 200°C for about an hour until the skin is crisp.', 'Split open and fluff the inside with the butter.', 'Top with grated cheese and sliced spring onion.'],
  },
  {
    title: 'Garlic Mushrooms on Toast', cuisine: 'British', servings: 1, minutes: 10,
    ingredients: [ing('Mushrooms', '150 g'), ing('Garlic', '1 clove'), ing('Butter', '15 g'), ing('Bread', '2 slices'), ing('Parsley', 'small handful')],
    steps: ['Slice the mushrooms and fry in the butter over a high heat until golden.', 'Add the crushed garlic for the last minute.', 'Toast the bread and pile the mushrooms on top with chopped parsley.'],
  },
  {
    title: 'Grilled Cheese Sandwich', cuisine: 'American', servings: 1, minutes: 8,
    ingredients: [ing('Bread', '2 slices'), ing('Cheddar Cheese', '50 g'), ing('Butter', '10 g')],
    steps: ['Butter the outside of each slice of bread.', 'Sandwich the cheese between the unbuttered sides.', 'Fry in a pan over a medium heat for 2–3 minutes a side until golden and melted.'],
  },
  {
    title: 'French Toast', cuisine: 'French', servings: 2, minutes: 10,
    ingredients: [ing('Bread', '4 slices'), ing('Eggs', '2'), ing('Milk', '100 ml'), ing('Butter', '15 g'), ing('Cinnamon', '1/2 tsp')],
    steps: ['Whisk the eggs, milk and cinnamon in a shallow dish.', 'Soak each slice of bread for a few seconds a side.', 'Fry in butter for 2 minutes a side until golden.', 'Serve with fruit, honey or syrup.'],
  },
  {
    title: 'Avocado Toast', cuisine: 'American', servings: 1, minutes: 5,
    ingredients: [ing('Bread', '2 slices'), ing('Avocado', '1'), ing('Lemon', '1/2'), ing('Chilli Flakes', 'pinch'), ing('Salt', 'pinch')],
    steps: ['Toast the bread.', 'Mash the avocado with lemon juice and salt.', 'Spread on the toast and sprinkle with chilli flakes.'],
  },
  {
    title: 'Cheese Quesadilla', cuisine: 'Mexican', servings: 1, minutes: 10,
    ingredients: [ing('Tortillas', '2'), ing('Cheddar Cheese', '60 g'), ing('Bell Pepper', '1/2'), ing('Onion', '1/4')],
    steps: ['Scatter the cheese, thinly sliced pepper and onion over one tortilla.', 'Top with the second tortilla.', 'Cook in a dry pan for 2–3 minutes a side until crisp and melted, then cut into wedges.'],
  },
  {
    title: 'Banana Pancakes', cuisine: 'American', servings: 1, minutes: 10,
    ingredients: [ing('Banana', '1 ripe'), ing('Eggs', '2'), ing('Butter', '1 tsp')],
    steps: ['Mash the banana until smooth, then beat in the eggs.', 'Melt a little butter in a non-stick pan over a medium heat.', 'Cook small spoonfuls for about a minute a side.', 'Great for using up an overripe banana.'],
  },
  {
    title: 'Overnight Oats', cuisine: 'British', servings: 1, minutes: 5,
    ingredients: [ing('Oats', '50 g'), ing('Milk', '150 ml'), ing('Yogurt', '2 tbsp'), ing('Honey', '1 tsp'), ing('Blueberries', 'handful')],
    steps: ['Mix the oats, milk, yogurt and honey in a jar.', 'Cover and leave in the fridge overnight.', 'Top with blueberries in the morning.'],
  },
  {
    title: 'Yogurt Fruit Bowl', cuisine: 'British', servings: 1, minutes: 5,
    ingredients: [ing('Yogurt', '200 g'), ing('Banana', '1'), ing('Apple', '1'), ing('Honey', '1 tsp'), ing('Oats', '2 tbsp')],
    steps: ['Spoon the yogurt into a bowl.', 'Top with the sliced banana and diced apple.', 'Scatter over the oats and drizzle with honey.'],
  },
  {
    title: 'Fruit Smoothie', cuisine: 'American', servings: 2, minutes: 5,
    ingredients: [ing('Banana', '1'), ing('Strawberries', '150 g'), ing('Yogurt', '150 g'), ing('Milk', '200 ml')],
    steps: ['Put everything in a blender.', 'Blend until smooth, adding more milk if it is too thick.', 'Frozen fruit works well and makes it extra cold.'],
  },
  {
    title: 'Simple Green Salad', cuisine: 'French', servings: 2, minutes: 5,
    ingredients: [ing('Lettuce', '1 head'), ing('Cucumber', '1/2'), ing('Tomatoes', '2'), ing('Olive Oil', '2 tbsp'), ing('Lemon', '1/2')],
    steps: ['Wash and dry the lettuce and tear into pieces.', 'Slice the cucumber and tomatoes.', 'Whisk the oil with lemon juice and a pinch of salt and toss everything together.'],
  },
];

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const BASIC_RECIPES: RecipeCandidate[] = BASICS.map(({ minutes, ...recipe }) => ({
  ...recipe,
  id: `basic_${slug(recipe.title)}`,
  category: 'Basic',
  description: `Quick and simple · about ${minutes} min`,
  source: 'database',
}));
