import { DependencyGraph, ParsedDocument } from '../DependencyGraph';

function makeDoc(id: string, refs: string[] = []): ParsedDocument {
  return { id, filePath: `/fake/${id}.md`, frontmatter: { refs: refs.map(r => ({ id: r })) } };
}

describe('DependencyGraph', () => {
  describe('getCircles - dynamic layer depth', () => {
    it('handles 3 layers', () => {
      const graph = new DependencyGraph();
      graph.build([
        makeDoc('a', []),
        makeDoc('b', ['@a']),
        makeDoc('c', ['@b']),
      ]);
      const circles = graph.getCircles();
      expect(circles).toHaveLength(3);
      expect(circles[0].name).toBe('zerocircle');
      expect(circles[0].index).toBe(0);
      expect(circles[0].assetIds).toEqual(['a']);
      expect(circles[1].name).toBe('firstcircle');
      expect(circles[1].index).toBe(1);
      expect(circles[2].name).toBe('secondcircle');
      expect(circles[2].index).toBe(2);
    });

    it('handles 2 layers', () => {
      const graph = new DependencyGraph();
      graph.build([
        makeDoc('x', []),
        makeDoc('y', ['@x']),
      ]);
      const circles = graph.getCircles();
      expect(circles).toHaveLength(2);
      expect(circles[0].name).toBe('zerocircle');
      expect(circles[0].index).toBe(0);
      expect(circles[1].name).toBe('firstcircle');
      expect(circles[1].index).toBe(1);
    });

    it('handles 9 layers without hardcoded bound', () => {
      const graph = new DependencyGraph();
      const docs: ParsedDocument[] = [];
      for (let i = 0; i < 9; i++) {
        const refs = i > 0 ? [`@layer${i - 1}`] : [];
        docs.push(makeDoc(`layer${i}`, refs));
      }
      graph.build(docs);
      const circles = graph.getCircles();
      expect(circles).toHaveLength(9);
      expect(circles[0].name).toBe('zerocircle');
      expect(circles[0].index).toBe(0);
      // 9 layers → index 0-8 → zerocircle..eighthcircle
      expect(circles[8].name).toBe('eighthcircle');
      expect(circles[8].index).toBe(8);
    });

    it('handles 15 layers without hardcoded bound', () => {
      const graph = new DependencyGraph();
      const docs: ParsedDocument[] = [];
      for (let i = 0; i < 15; i++) {
        const refs = i > 0 ? [`@layer${i - 1}`] : [];
        docs.push(makeDoc(`layer${i}`, refs));
      }
      graph.build(docs);
      const circles = graph.getCircles();
      expect(circles).toHaveLength(15);
      expect(circles[0].name).toBe('zerocircle');
      expect(circles[0].index).toBe(0);
      // All circles must have names
      for (const c of circles) {
        expect(typeof c.name).toBe('string');
        expect(c.name.length).toBeGreaterThan(0);
      }
      // index 14 beyond ordinals → circle_14
      expect(circles[14].name).toBe('circle.14');
      expect(circles[14].index).toBe(14);
    });

    it('end_circle when last layer contains shotlist', () => {
      const graph = new DependencyGraph();
      graph.build([
        makeDoc('a', []),
        makeDoc('shotlist', ['@a']),
      ]);
      const circles = graph.getCircles();
      expect(circles).toHaveLength(2);
      expect(circles[0].name).toBe('zerocircle');
      expect(circles[1].name).toBe('end_circle');
    });

    it('end_circle overrides ordinal name in deep graphs', () => {
      const graph = new DependencyGraph();
      const docs: ParsedDocument[] = [];
      for (let i = 0; i < 5; i++) {
        const refs = i > 0 ? [`@layer${i - 1}`] : [];
        docs.push(makeDoc(`layer${i}`, refs));
      }
      docs.push(makeDoc('shotlist', ['@layer4']));
      graph.build(docs);
      const circles = graph.getCircles();
      const last = circles[circles.length - 1];
      expect(last.name).toBe('end_circle');
      expect(last.assetIds).toContain('shotlist');
    });
  });
});
