"""Independent standard-library arithmetic audit. It never uses the app judge as its oracle.

Reference-expression checks establish consistency, not semantic validity. Prompt-derived
checks and the documented content review are reported separately; no teacher review is claimed.
"""
import ast, json, math, statistics, re, sys
from fractions import Fraction
from pathlib import Path
def solve2(a,b,c,d,e,f):
    det=a*e-b*d
    return [Fraction(c*e-b*f,det),Fraction(a*f-c*d,det)]
def roots2(a,b,c):
    d=b*b-4*a*c
    return sorted([(-b+math.sqrt(d))/(2*a),(-b-math.sqrt(d))/(2*a)])
env={n:getattr(math,n) for n in ('sqrt','isqrt','floor','ceil','comb','gcd','lcm','sin','cos','tan','asin','acos','atan','radians','degrees','log10')}
env.update(Fraction=Fraction,abs=abs,round=round,max=max,min=min,len=len,range=range,sum=sum,sorted=sorted,mean=statistics.mean,median=statistics.median,mode=statistics.mode,solve2=solve2,roots2=roots2)
allowed=(ast.Expression,ast.Constant,ast.Name,ast.Load,ast.Store,ast.BinOp,ast.UnaryOp,ast.BoolOp,ast.Compare,ast.IfExp,ast.List,ast.Tuple,ast.ListComp,ast.GeneratorExp,ast.comprehension,ast.Call,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.FloorDiv,ast.Mod,ast.Pow,ast.USub,ast.UAdd,ast.And,ast.Or,ast.Not,ast.Eq,ast.NotEq,ast.Gt,ast.GtE,ast.Lt,ast.LtE,ast.In,ast.NotIn,ast.Subscript,ast.Slice)
def calc(s):
    tree=ast.parse(s,mode='eval')
    for n in ast.walk(tree):
        if not isinstance(n,allowed):raise ValueError(type(n).__name__)
        if isinstance(n,ast.Call) and (not isinstance(n.func,ast.Name) or n.func.id not in env):raise ValueError('call')
    class Exact(ast.NodeTransformer):
        def visit_Constant(self,n):
            return ast.copy_location(ast.Call(func=ast.Name(id='Fraction',ctx=ast.Load()),args=[ast.Constant(str(n.value))],keywords=[]),n) if isinstance(n.value,float) else n
        def visit_BinOp(self,n):
            self.generic_visit(n)
            if isinstance(n.op,ast.Div):return ast.copy_location(ast.Call(func=ast.Name(id='_divide',ctx=ast.Load()),args=[n.left,n.right],keywords=[]),n)
            return n
    tree=ast.fix_missing_locations(Exact().visit(tree))
    return eval(compile(tree,'<math>','eval'),{'__builtins__':{},'_divide':lambda a,b:Fraction(a)/Fraction(b),**env})
def norm(s):
    s=re.sub(r'\s','',str(s)).replace('−','-').replace('－','-').replace('，',',').replace('（','(').replace('）',')').replace('＋','+').replace('×','*').replace('÷','/').replace('π','pi').replace('^','**')
    return re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+',lambda m:'**'+m[0].translate(str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹','0123456789')),s)
def scalar(s):
    s=norm(s)
    s=re.sub(r'√(\d+(?:\.\d+)?)',r'sqrt(\1)',s)
    s=s.replace('√(','sqrt(')
    s=re.sub(r'(?<=\d)(?=pi|sqrt)','*',s)
    s=re.sub(r'(\d+(?:\.\d+)?)(?:立方厘米|立方分米|立方米|平方厘米|平方分米|平方米|°|度|个|人|本|厘米|千米|米|秒|分|时|元|天|条|千克|克|cm|km|m|kg|g|份)$',r'\1',s)
    s=re.sub(r'(\d+(?:\.\d+)?)%',r'(\1/100)',s)
    if re.fullmatch(r'[0-9+\-*/().]+|[0-9+\-*/().pisqrt]+',s):return calc(s.replace('pi',str(math.pi)))
    raise ValueError('not scalar')
def equal(v,text,unordered=False):
    if isinstance(v,(tuple,list)):
        parts=norm(text).strip('()').split(',')
        if len(parts)!=len(v):return False
        if unordered:
            try:return all(abs(float(a)-float(b))<1e-7 for a,b in zip(sorted(map(float,v)), sorted(scalar(x) for x in parts)))
            except:return False
        return all(equal(a,b) for a,b in zip(v,parts))
    if isinstance(v,str):return norm(v)==norm(text)
    try:return math.isclose(float(v),float(scalar(text)),rel_tol=1e-8,abs_tol=1e-8)
    except:return None
def answer(q):
    return next(c['text'] for c in q['choices'] if c['key']==q['answer']) if q['type']=='choice' else q['answer']
def prompt_value(q):
    p=q['prompt']
    if q['type']=='numeric' and ',' not in norm(answer(q)):
        m=re.match(r'计算[:：\s]*([0-9.\s+\-−－＋×·÷*/()（）\[\]⁰¹²³⁴⁵⁶⁷⁸⁹^%√]+)',p)
        tail=p[m.end():] if m else ''
        if m and not re.match(r'[a-zA-Z]|后',tail) and not re.search(r'结果等于|[kK]√|系数',tail) and re.search(r'[+\-−－＋×·÷*/²³^]',m[1]):
            text=norm(m[1]).replace('[','(').replace(']',')')
            text=re.sub(r'√(\d+)',r'sqrt(\1)',text).replace('√(','sqrt(')
            try:return ('printed-arithmetic',calc(text))
            except (ValueError,SyntaxError,TypeError,ZeroDivisionError):pass
    units={'毫米':('length',Fraction(1,1000)),'厘米':('length',Fraction(1,100)),'分米':('length',Fraction(1,10)),'米':('length',1),'千米':('length',1000),'克':('mass',1),'千克':('mass',1000),'吨':('mass',1000000),'秒':('time',1),'分':('time',60),'时':('time',3600),'毫升':('volume',1),'升':('volume',1000),'平方米':('area',10000),'平方分米':('area',100),'平方厘米':('area',1),'立方厘米':('volume',1),'立方分米':('volume',1000),'立方米':('volume',1000000)}
    names='|'.join(sorted(units,key=len,reverse=True))
    m=re.search(r'(\d+(?:\.\d+)?)\s*('+names+r')(?:是|等于|合)?多少('+names+r')',p)
    if m and units[m[2]][0]==units[m[3]][0]:return ('printed-unit-conversion',Fraction(m[1])*units[m[2]][1]/units[m[3]][1])
    return None
def audit():
    qs=json.loads(Path('source/questions.json').read_text(encoding='utf8'))
    original={q['id']:q for q in qs}
    ledger=json.loads(Path('docs/development/2026-10-29-question-revisions.json').read_text(encoding='utf8'))
    for row in ledger['revisions']:original[row['id']]=row['previous']
    rows=[]
    def check(q,method,expected):
        text=answer(q);ok=equal(expected,text,q.get('unordered',False))
        rows.append({'id':q['id'],'method':method,'status':'match' if ok else 'unparsed' if ok is None else 'mismatch','expected':str(expected),'answer':text})
    for q in original.values():
        if q.get('verify'):check(q,'original-reference-expression',calc(q['verify']))
    for q in qs:
        if q.get('verify'):check(q,'current-reference-expression',calc(q['verify']))
        found=prompt_value(q)
        if found:check(q,*found)
        proof=q.get('auditProof',{})
        if proof.get('kind')=='triangle-inradius':
            a,b,c=proof['sides'];s=(a+b+c)/2;area=math.sqrt(s*(s-a)*(s-b)*(s-c))
            assert min(a+b-c,a+c-b,b+c-a)>0 and a+b+c==proof['perimeter']
            assert math.isclose(area/s,proof['radius'])
            check(q,'geometric-feasibility-and-Heron',area)
        if proof.get('kind')=='linear-system':check(q,'independent-linear-system',solve2(*proof['coefficients']))
    from collections import Counter
    failures=[r for r in rows if r['status']=='mismatch']
    unresolved=[r for r in rows if r['status']=='unparsed']
    report={'version':json.loads(Path('package.json').read_text(encoding='utf8'))['version'],'sourceQuestions':len(qs),'topics':len(json.loads(Path('source/topics.json').read_text(encoding='utf8'))),'contentRevisions':len(ledger['revisions']),'revisedTopics':len(set(r['topicId'] for r in ledger['revisions'])),'methods':dict(Counter(r['method'] for r in rows)),'arithmeticMatches':sum(r['status']=='match' for r in rows),'failures':failures,'unresolvedComparisons':unresolved,'scope':'Independent arithmetic and prompt-derived checks; all source prompts also received AI content review. No teacher review, calibrated item difficulty or student-effect validation.','teacherReviewed':False}
    if '--write' in sys.argv:Path('docs/development/2026-10-29-question-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False))
    if failures or unresolved:raise SystemExit(1)
if __name__=='__main__':audit()
