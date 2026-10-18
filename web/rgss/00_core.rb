# RGSS2 (RPG Maker VX) 호환 런타임 - 코어 (Ruby 3.3 / ruby.wasm 위에서 실행)
require 'js'
require 'json'
require 'zlib'

$js = JS.global[:RGSS]
$PROF = JS.global[:location][:search].to_s.include?('prof')
if $PROF
  require 'objspace'
  class ProfJS
    attr_reader :by
    def initialize(o); @o = o; @by = Hash.new(0); end
    def call(n, *a); @by[n] += 1; @o.call(n, *a); end
    def [](k); @o[k]; end
  end
  $js = ProfJS.new($js)
end
$TEST = false
$BTEST = false

# ---------------------------------------------------------------- Ruby 1.8 -> 3.x 호환
Fixnum = Integer unless defined?(Fixnum)
Bignum = Integer unless defined?(Bignum)

class Object
  def id; object_id; end unless method_defined?(:id)
  def type; self.class; end unless method_defined?(:type)
end

class Array
  def nitems; compact.size; end unless method_defined?(:nitems)
  def to_a; self; end
end

class String
  def each(&b); each_line(&b); end unless method_defined?(:each)
  def to_a; lines.to_a; end unless method_defined?(:to_a)
  def sjis_fix; self; end
end

class Hash
  def index(v); key(v); end unless method_defined?(:index)
end

class NilClass
  def to_a; []; end
end

module Kernel
  alias_method :__orig_p, :p
  def print(*a); $js.call(:log, a.join); nil; end
  def msgbox(*a); $js.call(:log, a.join); nil; end
  def msgbox_p(*a); $js.call(:log, a.map { |x| x.inspect }.join("\n")); nil; end
  def rgss_main; yield; end
  def rgss_stop; raise SystemExit; end
  def load_data(filename)
    b64 = $js.call(:readB64, filename.to_s).to_s
    raise Errno::ENOENT, filename.to_s if b64.empty?
    bin = b64.unpack1('m')
    Marshal.load(bin, proc { |o|
      o.force_encoding(Encoding::UTF_8) if o.is_a?(String) && o.encoding == Encoding::BINARY
      o
    })
  end
  def save_data(obj, filename)
    File.open(filename.to_s, 'wb') { |f| Marshal.dump(obj, f) }
  end
end

# 외부 API (Win32 등) 호출은 웹에서 불가능하므로 아무것도 하지 않는다
class Win32API
  def initialize(*a); end
  def call(*a); 0; end
  alias_method :Call, :call
end

class RGSSError < StandardError; end
class RGSSReset < Exception; end

# ---------------------------------------------------------------- Rect / Color / Tone
class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, w = 0, h = 0); @x = x; @y = y; @width = w; @height = h; end
  def set(x, y, w, h); @x = x; @y = y; @width = w; @height = h; self; end
  def empty; @x = @y = @width = @height = 0; self; end
  def ==(o); o.is_a?(Rect) && @x == o.x && @y == o.y && @width == o.width && @height == o.height; end
  def to_s; "(#{@x}, #{@y}, #{@width}, #{@height})"; end
  def _dump(d = 0); [@x, @y, @width, @height].pack('l4'); end
  def self._load(s); new(*s.unpack('l4')); end
end

class Color
  attr_reader :red, :green, :blue, :alpha
  def initialize(r = 0, g = 0, b = 0, a = 255); set(r, g, b, a); end
  def set(r, g = nil, b = nil, a = 255)
    if r.is_a?(Color)
      @red, @green, @blue, @alpha = r.red, r.green, r.blue, r.alpha
    else
      @red = c255(r); @green = c255(g); @blue = c255(b); @alpha = c255(a)
    end
    self
  end
  def red=(v); @red = c255(v); end
  def green=(v); @green = c255(v); end
  def blue=(v); @blue = c255(v); end
  def alpha=(v); @alpha = c255(v); end
  def ==(o); o.is_a?(Color) && @red == o.red && @green == o.green && @blue == o.blue && @alpha == o.alpha; end
  def to_s; "(#{@red}, #{@green}, #{@blue}, #{@alpha})"; end
  def _dump(d = 0); [@red, @green, @blue, @alpha].pack('d4'); end
  def self._load(s); new(*s.unpack('d4')); end
  private
  def c255(v); v = v.to_f; v < 0 ? 0.0 : (v > 255 ? 255.0 : v); end
end

class Tone
  attr_reader :red, :green, :blue, :gray
  def initialize(r = 0, g = 0, b = 0, gr = 0); set(r, g, b, gr); end
  def set(r, g = nil, b = nil, gr = 0)
    if r.is_a?(Tone)
      @red, @green, @blue, @gray = r.red, r.green, r.blue, r.gray
    else
      @red = t255(r); @green = t255(g); @blue = t255(b); @gray = c255(gr)
    end
    self
  end
  def red=(v); @red = t255(v); end
  def green=(v); @green = t255(v); end
  def blue=(v); @blue = t255(v); end
  def gray=(v); @gray = c255(v); end
  def ==(o); o.is_a?(Tone) && @red == o.red && @green == o.green && @blue == o.blue && @gray == o.gray; end
  def to_s; "(#{@red}, #{@green}, #{@blue}, #{@gray})"; end
  def _dump(d = 0); [@red, @green, @blue, @gray].pack('d4'); end
  def self._load(s); new(*s.unpack('d4')); end
  private
  def t255(v); v = v.to_f; v < -255 ? -255.0 : (v > 255 ? 255.0 : v); end
  def c255(v); v = v.to_f; v < 0 ? 0.0 : (v > 255 ? 255.0 : v); end
end

# ---------------------------------------------------------------- Table
class Table
  attr_reader :xsize, :ysize, :zsize
  def initialize(x, y = 0, z = 0)
    @dim = z > 0 ? 3 : (y > 0 ? 2 : 1)
    @xsize = x; @ysize = [y, 1].max; @zsize = [z, 1].max
    @data = Array.new(@xsize * @ysize * @zsize, 0)
  end
  def resize(x, y = 0, z = 0)
    nd = z > 0 ? 3 : (y > 0 ? 2 : 1)
    ny = [y, 1].max; nz = [z, 1].max
    nt = Table.new(x, y, z)
    [@xsize, x].min.times { |i| [@ysize, ny].min.times { |j| [@zsize, nz].min.times { |k| nt[i, j, k] = self[i, j, k] } } }
    @dim = nd; @xsize = x; @ysize = ny; @zsize = nz; @data = nt.raw
  end
  def raw; @data; end
  def dim; @dim; end
  def [](x, y = 0, z = 0)
    return nil if x < 0 || y < 0 || z < 0 || x >= @xsize || y >= @ysize || z >= @zsize
    @data[x + y * @xsize + z * @xsize * @ysize]
  end
  def []=(*args)
    v = args.pop
    x, y, z = args[0], args[1] || 0, args[2] || 0
    return if x < 0 || y < 0 || z < 0 || x >= @xsize || y >= @ysize || z >= @zsize
    @data[x + y * @xsize + z * @xsize * @ysize] = v.to_i
  end
  def _dump(d = 0)
    [@dim, @xsize, @ysize, @zsize, @xsize * @ysize * @zsize].pack('l5') + @data.pack('s*')
  end
  def self._load(s)
    dim, x, y, z, size = s.unpack('l5')
    t = allocate
    t.instance_variable_set(:@dim, dim)
    t.instance_variable_set(:@xsize, x)
    t.instance_variable_set(:@ysize, y)
    t.instance_variable_set(:@zsize, z)
    t.instance_variable_set(:@data, s.byteslice(20, size * 2).unpack('s*'))
    t
  end
end

# ---------------------------------------------------------------- Font
class Font
  @@default_name = ['Arial']
  @@default_size = 20
  @@default_bold = false
  @@default_italic = false
  @@default_color = Color.new(255, 255, 255, 255)
  attr_accessor :name, :size, :bold, :italic, :color
  def self.exist?(name); true; end
  def self.default_name; @@default_name; end
  def self.default_name=(v); @@default_name = v; end
  def self.default_size; @@default_size; end
  def self.default_size=(v); @@default_size = v; end
  def self.default_bold; @@default_bold; end
  def self.default_bold=(v); @@default_bold = v; end
  def self.default_italic; @@default_italic; end
  def self.default_italic=(v); @@default_italic = v; end
  def self.default_color; @@default_color; end
  def self.default_color=(v); @@default_color = v; end
  def initialize(name = nil, size = nil)
    @name = name || @@default_name
    @size = size || @@default_size
    @bold = @@default_bold
    @italic = @@default_italic
    @color = @@default_color.dup
  end
  def css_name
    n = @name.is_a?(Array) ? @name : [@name]
    n.map { |s| s.to_s }.join('|')
  end
end

# ---------------------------------------------------------------- RPG 모듈 헬퍼
module RPG
  class AudioFile
    attr_accessor :name, :volume, :pitch
    def initialize(name = '', volume = 100, pitch = 100)
      @name = name; @volume = volume; @pitch = pitch
    end
  end
  class BaseItem; end
  class UsableItem < BaseItem; end
end

RPG_SUPERCLASS = {
  'BGM' => 'AudioFile', 'BGS' => 'AudioFile', 'ME' => 'AudioFile', 'SE' => 'AudioFile',
  'Skill' => 'UsableItem', 'Item' => 'UsableItem', 'Weapon' => 'BaseItem', 'Armor' => 'BaseItem'
}

def __rpg_class(*path)
  attrs = path.pop
  mod = Object
  path[0...-1].each { |n| mod = mod.const_get(n) }
  name = path.last
  klass = if mod.const_defined?(name, false) then mod.const_get(name)
          else
            sup = (mod == RPG && RPG_SUPERCLASS[name]) ? RPG.const_get(RPG_SUPERCLASS[name]) : Object
            mod.const_set(name, Class.new(sup))
          end
  klass.send(:attr_accessor, *attrs)
end
